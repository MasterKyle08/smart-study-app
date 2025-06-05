/**
 * @file backend/routes/study.js
 * @description Routes for study material processing, session management, and AI interactions.
 */
const express = require('express');
const fileService = require('../services/file');
const aiService = require('../services/ai'); 
const Session = require('../models/Session');
const authenticateToken = require('../middleware/auth'); // Middleware for protected routes

const router = express.Router();

// --- Process Uploaded Content ---
router.post('/process', async (req, res) => {
  console.log("--- ROUTE HIT: /api/study/process ---"); 
  
  // Determine user ID (if authenticated)
  let userId = null;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token && process.env.JWT_SECRET) { // Ensure JWT_SECRET is available
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const User = require('../models/User'); 
      const userExists = await User.findById(decoded.userId);
      if (userExists) userId = decoded.userId;
    } catch (err) { 
        console.warn("[/process] JWT verification failed or user not found, proceeding as anonymous. Error:", err.message);
    }
  } else if (token && !process.env.JWT_SECRET) {
      console.warn("[/process] JWT token present but JWT_SECRET is not set. Cannot authenticate user.");
  }


  try {
    const { 
        extractedText, originalFilename, originalContentType, outputFormats,
        summaryLengthPreference, summaryStylePreference,
        summaryKeywords: summaryKeywordsString, 
        summaryAudiencePurpose,
        summaryNegativeKeywords: summaryNegativeKeywordsString,
        quizOptions // This should be the object from the frontend now
    } = req.body;

    if (!extractedText || !originalFilename || !originalContentType || !outputFormats) {
      console.error("[/process] Validation Error: Missing required fields for processing.");
      return res.status(400).json({ message: 'Missing required fields for processing.' });
    }
    if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
      console.error("[/process] Validation Error: outputFormats must be a non-empty array.");
      return res.status(400).json({ message: 'outputFormats must be a non-empty array.' });
    }

    const summaryKeywordsArray = summaryKeywordsString 
        ? summaryKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];
    const summaryNegativeKeywordsArray = summaryNegativeKeywordsString 
        ? summaryNegativeKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];

    console.log("[/process] Calling fileService.processUploadedText with quizOptions:", JSON.stringify(quizOptions));
    const results = await fileService.processUploadedText({
      extractedText, 
      outputFormats, 
      originalFilename, 
      originalContentType, 
      userId, 
      summaryLengthPreference, 
      summaryStylePreference,
      summaryKeywords: summaryKeywordsArray,
      summaryAudiencePurpose,
      summaryNegativeKeywords: summaryNegativeKeywordsArray,
      quizOptions // Pass the structured quizOptions object
    });
    
    console.log("[/process] fileService.processUploadedText successful. Sending response.");
    // Ensure flashcards and quiz are parsed if they are stringified JSON before sending to client
    // (Though fileService should ideally return them parsed if it stores them stringified)
    if (results.flashcards && typeof results.flashcards === 'string') {
        try { results.flashcards = JSON.parse(results.flashcards); } catch (e) { console.error("Error parsing flashcards string in route:", e); }
    }
    if (results.quiz && typeof results.quiz === 'string') {
        try { results.quiz = JSON.parse(results.quiz); } catch (e) { console.error("Error parsing quiz string in route:", e); }
    }
    results.quizOptions = quizOptions; // Also return the options used for this generation
    results.summaryKeywords = summaryKeywordsArray; // Return keywords used for summary

    res.status(200).json(results);
  } catch (error) {
    console.error("[/process] Error in route handler:", error.message, error.stack ? error.stack.substring(0, 500) : '', error.originalError ? `Original Error: ${error.originalError.message}` : '');
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process content.' });
  }
});

// --- Flashcard Interactions ---
router.post('/flashcard-interact', async (req, res) => {
    try {
        const { card, interactionType, userAnswer, userQuery, chatHistory } = req.body;
        if (!card || !card.term || !card.definition || !interactionType) {
            return res.status(400).json({ message: 'Missing required fields for flashcard interaction (card, interactionType).' });
        }
        // Validate other fields based on interactionType if necessary
        if (interactionType === 'chat_message' && (!userQuery || !Array.isArray(chatHistory))) {
             return res.status(400).json({ message: 'Missing userQuery or chatHistory for chat_message interaction.' });
        }

        const result = await aiService.getFlashcardInteractionResponse(card, interactionType, userAnswer, userQuery, chatHistory);
        res.status(200).json(result); // `result` should now contain { feedback, correctness } for submit_answer
    } catch (error) {
        console.error("[/flashcard-interact] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process flashcard interaction.' });
    }
});

// --- Quiz Generation and Interactions ---
router.post('/quiz-generate', async (req, res) => { // For generating a new quiz from text + options
    try {
        const { extractedText, quizOptions } = req.body;
        if (!extractedText || !quizOptions || !Array.isArray(quizOptions.questionTypes) || quizOptions.questionTypes.length === 0) {
            return res.status(400).json({ message: 'Extracted text and valid quiz options (including questionTypes) are required.' });
        }
        const quizData = await aiService.generateQuizWithOptions(extractedText, quizOptions);
        res.status(200).json({ quiz: quizData, quizOptionsUsed: quizOptions }); // Return generated quiz and options used
    } catch (error) {
        console.error("[/quiz-generate] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to generate quiz.' });
    }
});

router.post('/quiz-answer-feedback', async (req, res) => {
    try {
        const { question, userAnswer } = req.body;
        if (!question || userAnswer === undefined) { // userAnswer can be null or empty string
            return res.status(400).json({ message: 'Question object and user answer are required.' });
        }
        const feedbackData = await aiService.getQuizAnswerFeedback(question, userAnswer);
        res.status(200).json(feedbackData); // Should return { feedback, correctness }
    } catch (error) {
        console.error("[/quiz-answer-feedback] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to get answer feedback.' });
    }
});

router.post('/quiz-question-explanation', async (req, res) => {
    try {
        const { question } = req.body;
        if (!question || !question.questionText || question.correctAnswer === undefined) {
            return res.status(400).json({ message: 'Valid question data (including questionText and correctAnswer) is required.' });
        }
        const explanationData = await aiService.getQuizQuestionDetailedExplanation(question);
        res.status(200).json(explanationData); // Should return { explanation: string }
    } catch (error) {
        console.error("[/quiz-question-explanation] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to get detailed explanation.' });
    }
});

router.post('/quiz-chat', async (req, res) => {
    try {
        const { question, chatHistory, userQuery } = req.body;
        if (!question || !Array.isArray(chatHistory) || !userQuery) {
            return res.status(400).json({ message: 'Question, chat history, and user query are required.' });
        }
        const chatResponseData = await aiService.chatAboutQuizQuestion(question, chatHistory, userQuery);
        res.status(200).json(chatResponseData); // Should return { chatResponse, updatedChatHistory }
    } catch (error) {
        console.error("[/quiz-chat] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process quiz chat.' });
    }
});

router.post('/quiz-regenerate-question', async (req, res) => {
    try {
        const { originalQuestion, textContext, difficultyHint } = req.body;
        if (!originalQuestion || !textContext) {
            return res.status(400).json({ message: 'Original question and text context are required.' });
        }
        const newQuestion = await aiService.regenerateQuizQuestion(originalQuestion, textContext, difficultyHint);
        res.status(200).json({ question: newQuestion }); // Return the new question object
    } catch (error) {
        console.error("[/quiz-regenerate-question] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to regenerate quiz question.' });
    }
});


// --- Session Management Routes (Authenticated) ---
router.put('/sessions/:id/regenerate', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ message: 'Invalid session ID.' });
    
    const { 
        outputFormats, summaryLengthPreference, summaryStylePreference,
        summaryKeywords: summaryKeywordsString,
        summaryAudiencePurpose,
        summaryNegativeKeywords: summaryNegativeKeywordsString,
        quizOptions // Get quiz options for regeneration if provided
    } = req.body;

    if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
      return res.status(400).json({ message: 'outputFormats array is required.' });
    }

    const existingSession = await Session.findById(sessionId);
    if (!existingSession) return res.status(404).json({ message: 'Session not found.' });
    if (existingSession.user_id !== req.user.id) return res.status(403).json({ message: 'Access denied.' });
    if (!existingSession.extracted_text) return res.status(400).json({ message: 'Original text for session not found, cannot regenerate.' });

    const summaryKeywordsArray = summaryKeywordsString 
        ? summaryKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];
    const summaryNegativeKeywordsArray = summaryNegativeKeywordsString 
        ? summaryNegativeKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];

    const regeneratedResults = {};
    if (outputFormats.includes('summary') || outputFormats.includes('all')) {
      regeneratedResults.summary = await aiService.generateSummary(
          existingSession.extracted_text, 
          summaryLengthPreference, summaryStylePreference,
          summaryKeywordsArray, summaryAudiencePurpose,
          summaryNegativeKeywordsArray 
      );
    }
    if (outputFormats.includes('flashcards') || outputFormats.includes('all')) {
      const flashcardsArray = await aiService.generateFlashcards(existingSession.extracted_text);
      regeneratedResults.flashcards = JSON.stringify(flashcardsArray); // Store as string
    }
    if (outputFormats.includes('quiz') || outputFormats.includes('all')) {
      // Use provided quizOptions for regeneration, or fall back to existing/default if not provided
      const currentQuizOptions = quizOptions || 
                                 (existingSession.quiz_options ? JSON.parse(existingSession.quiz_options) : null) || // Assuming quiz_options stored in session
                                 { questionTypes: ['multiple_choice'], numQuestions: 'ai_choice', difficulty: 'medium' };
      
      if (!currentQuizOptions.questionTypes || currentQuizOptions.questionTypes.length === 0) {
        currentQuizOptions.questionTypes = ['multiple_choice']; // Ensure valid default
      }
      const quizArray = await aiService.generateQuizWithOptions(existingSession.extracted_text, currentQuizOptions);
      regeneratedResults.quiz = JSON.stringify(quizArray); // Store as string
      // Optionally, store quiz_options used if the schema supports it.
      // regeneratedResults.quiz_options = JSON.stringify(currentQuizOptions); 
    }
    
    const updatedSession = await Session.updateAiContent(sessionId, regeneratedResults);
    // Parse stringified JSON fields before sending back to client
    const parsedUpdatedSession = {
        ...updatedSession,
        flashcards: updatedSession.flashcards ? JSON.parse(updatedSession.flashcards) : null,
        quiz: updatedSession.quiz ? JSON.parse(updatedSession.quiz) : null,
        summary_keywords: summaryKeywordsArray, // Send back keywords used
        // quiz_options: updatedSession.quiz_options ? JSON.parse(updatedSession.quiz_options) : (quizOptions || null)
    };
    if (quizOptions) parsedUpdatedSession.quiz_options = quizOptions; // Send back options used for this specific regen

    res.status(200).json({ updatedSession: parsedUpdatedSession });
  } catch (error) {
    console.error("[/sessions/:id/regenerate] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to regenerate content.' });
  }
});

// --- Explain Text Snippet ---
router.post('/explain-snippet', async (req, res) => {
  try {
    const { snippet } = req.body;
    if (!snippet || typeof snippet !== 'string' || snippet.trim() === "") {
      return res.status(400).json({ message: 'Snippet is required and must be a non-empty string.' });
    }
    if (snippet.length > 1000) { // Increased limit slightly, but keep it reasonable
        return res.status(400).json({ message: 'Snippet is too long (max 1000 characters). Please select a shorter text.'});
    }
    const explanation = await aiService.explainTextSnippet(snippet);
    res.status(200).json({ explanation });
  } catch (error) {
    console.error("[/explain-snippet] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to explain snippet.' });
  }
});

// --- Get User's Saved Sessions ---
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await Session.findByUserId(req.user.id);
    // Parse JSON fields for client
    const parsedSessions = sessions.map(session => ({
      ...session,
      flashcards: session.flashcards ? JSON.parse(session.flashcards) : null,
      quiz: session.quiz ? JSON.parse(session.quiz) : null,
      // summary_keywords might be stored or derived; assuming not directly stored for now on list view
      // quiz_options: session.quiz_options ? JSON.parse(session.quiz_options) : null,
    }));
    res.status(200).json({ sessions: parsedSessions });
  } catch (error) {
    console.error("[/sessions GET] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
    res.status(error.statusCode || 500).json({ message: 'Failed to retrieve sessions.' });
  }
});

// --- Get Specific Session Details ---
router.get('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ message: 'Invalid session ID.' });

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (session.user_id !== req.user.id) return res.status(403).json({ message: 'Access denied to this session.' });
    
    // Parse JSON fields for client
    const parsedSession = {
        ...session,
        flashcards: session.flashcards ? JSON.parse(session.flashcards) : null,
        quiz: session.quiz ? JSON.parse(session.quiz) : null,
        // summary_keywords can be re-derived or stored if needed for dashboard modal later
        // quiz_options: session.quiz_options ? JSON.parse(session.quiz_options) : null,
    };
    res.status(200).json({ session: parsedSession });
  } catch (error) {
    console.error("[/sessions/:id GET] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
    res.status(error.statusCode || 500).json({ message: 'Failed to retrieve session details.' });
  }
});

// --- Delete a Session ---
router.delete('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
     if (isNaN(sessionId)) return res.status(400).json({ message: 'Invalid session ID.' });

    await Session.deleteById(sessionId, req.user.id);
    res.status(200).json({ message: 'Session deleted successfully.' });
  } catch (error) {
    console.error("[/sessions/:id DELETE] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
    if (error.message.includes('not found or user not authorized')) { // Specific error from model
        return res.status(error.statusCode || 404).json({ message: error.message });
    }
    res.status(error.statusCode || 500).json({ message: 'Failed to delete session.' });
  }
});

module.exports = router;
