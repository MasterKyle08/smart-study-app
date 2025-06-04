const express = require('express');
const fileService = require('../services/file');
const aiService = require('../services/ai'); 
const Session = require('../models/Session');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.post('/process', async (req, res) => {
  console.log("--- HIT /api/study/process ROUTE ---"); 
  console.log("Request Body for /process:", JSON.stringify(req.body, null, 2)); 

  let userId = null;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const User = require('../models/User'); 
      const userExists = await User.findById(decoded.userId);
      if (userExists) userId = decoded.userId;
    } catch (err) { 
        console.warn("[/process] JWT verification failed or user not found, proceeding as anonymous:", err.message);
    }
  }

  try {
    const { 
        extractedText, originalFilename, originalContentType, outputFormats,
        summaryLengthPreference, summaryStylePreference,
        summaryKeywords: summaryKeywordsString, 
        summaryAudiencePurpose,
        summaryNegativeKeywords: summaryNegativeKeywordsString,
        quizOptions 
    } = req.body;

    if (!extractedText || !originalFilename || !originalContentType || !outputFormats) {
      console.error("[/process] Validation Error: Missing required fields.");
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

    console.log("[/process] Calling fileService.processUploadedText...");
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
      quizOptions 
    });
    
    console.log("[/process] fileService.processUploadedText successful. Sending response.");
    res.status(200).json(results);
  } catch (error) {
    console.error("[/process] Error in route handler:", error.message, error.stack ? error.stack.substring(0, 300) : '', error.originalError ? `Original Error: ${error.originalError.message}` : '');
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process content.' });
  }
});

router.post('/flashcard-interact', async (req, res) => {
    try {
        const { card, interactionType, userAnswer, userQuery, chatHistory } = req.body;
        if (!card || !card.term || !card.definition || !interactionType) {
            return res.status(400).json({ message: 'Missing required fields for flashcard interaction.' });
        }
        const result = await aiService.getFlashcardInteractionResponse(card, interactionType, userAnswer, userQuery, chatHistory);
        res.status(200).json(result);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process flashcard interaction.' });
    }
});

router.post('/quiz-generate', async (req, res) => {
    try {
        const { extractedText, quizOptions } = req.body;
        if (!extractedText || !quizOptions) {
            return res.status(400).json({ message: 'Extracted text and quiz options are required.' });
        }
        const quizData = await aiService.generateQuizWithOptions(extractedText, quizOptions);
        res.status(200).json({ quiz: quizData });
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to generate quiz.' });
    }
});

router.post('/quiz-answer-feedback', async (req, res) => {
    try {
        const { question, userAnswer } = req.body;
        if (!question || userAnswer === undefined) { 
            return res.status(400).json({ message: 'Question and user answer are required.' });
        }
        const feedback = await aiService.getQuizAnswerFeedback(question, userAnswer);
        res.status(200).json(feedback);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to get answer feedback.' });
    }
});

router.post('/quiz-question-explanation', async (req, res) => {
    try {
        const { question } = req.body;
        if (!question) {
            return res.status(400).json({ message: 'Question data is required.' });
        }
        const explanation = await aiService.getQuizQuestionDetailedExplanation(question);
        res.status(200).json(explanation);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to get detailed explanation.' });
    }
});

router.post('/quiz-chat', async (req, res) => {
    try {
        const { question, chatHistory, userQuery } = req.body;
        if (!question || !chatHistory || !userQuery) {
            return res.status(400).json({ message: 'Question, chat history, and user query are required.' });
        }
        const chatResponse = await aiService.chatAboutQuizQuestion(question, chatHistory, userQuery);
        res.status(200).json(chatResponse);
    } catch (error) {
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
        res.status(200).json({ question: newQuestion });
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to regenerate quiz question.' });
    }
});


router.put('/sessions/:id/regenerate', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ message: 'Invalid session ID.' });
    
    const { 
        outputFormats, summaryLengthPreference, summaryStylePreference,
        summaryKeywords: summaryKeywordsString,
        summaryAudiencePurpose,
        summaryNegativeKeywords: summaryNegativeKeywordsString,
        quizOptions 
    } = req.body;

    if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
      return res.status(400).json({ message: 'outputFormats array is required.' });
    }

    const existingSession = await Session.findById(sessionId);
    if (!existingSession) return res.status(404).json({ message: 'Session not found.' });
    if (existingSession.user_id !== req.user.id) return res.status(403).json({ message: 'Access denied.' });
    if (!existingSession.extracted_text) return res.status(400).json({ message: 'Original text not found.' });

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
      regeneratedResults.flashcards = JSON.stringify(flashcardsArray);
    }
    if (outputFormats.includes('quiz') || outputFormats.includes('all')) {
      const currentQuizOptions = quizOptions || { questionTypes: ['multiple_choice'], numQuestions: 'ai_choice', difficulty: 'medium' };
      const quizArray = await aiService.generateQuizWithOptions(existingSession.extracted_text, currentQuizOptions);
      regeneratedResults.quiz = JSON.stringify(quizArray);
    }
    
    const updatedSession = await Session.updateAiContent(sessionId, regeneratedResults);
    const parsedUpdatedSession = {
        ...updatedSession,
        flashcards: updatedSession.flashcards ? JSON.parse(updatedSession.flashcards) : null,
        quiz: updatedSession.quiz ? JSON.parse(updatedSession.quiz) : null,
    };
    res.status(200).json({ updatedSession: parsedUpdatedSession });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to regenerate content.' });
  }
});

router.post('/explain-snippet', async (req, res) => {
  try {
    const { snippet } = req.body;
    if (!snippet || typeof snippet !== 'string' || snippet.trim() === "") {
      return res.status(400).json({ message: 'Snippet is required and must be a non-empty string.' });
    }
    if (snippet.length > 500) { 
        return res.status(400).json({ message: 'Snippet is too long. Please select a shorter text.'});
    }
    const explanation = await aiService.explainTextSnippet(snippet);
    res.status(200).json({ explanation });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to explain snippet.' });
  }
});

router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await Session.findByUserId(req.user.id);
    const parsedSessions = sessions.map(session => ({
      ...session,
      flashcards: session.flashcards ? JSON.parse(session.flashcards) : null,
      quiz: session.quiz ? JSON.parse(session.quiz) : null,
    }));
    res.status(200).json({ sessions: parsedSessions });
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve sessions.' });
  }
});

router.get('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ message: 'Invalid session ID.' });
    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (session.user_id !== req.user.id) return res.status(403).json({ message: 'Access denied.' });
    const parsedSession = {
        ...session,
        flashcards: session.flashcards ? JSON.parse(session.flashcards) : null,
        quiz: session.quiz ? JSON.parse(session.quiz) : null,
    };
    res.status(200).json({ session: parsedSession });
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve session.' });
  }
});

router.delete('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
     if (isNaN(sessionId)) return res.status(400).json({ message: 'Invalid session ID.' });
    await Session.deleteById(sessionId, req.user.id);
    res.status(200).json({ message: 'Session deleted successfully.' });
  } catch (error) {
    if (error.message.includes('not found or user not authorized')) {
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete session.' });
  }
});

module.exports = router;
