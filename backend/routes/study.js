/**
 * @file backend/routes/study.js
 * @description Routes for study material processing, session management, and AI interactions.
 */
const express = require('express');
const fileService = require('../services/file');
const aiService = require('../services/ai'); 
const Session = require('../models/Session');
const authenticateToken = require('../middleware/auth');
const { userFromRequest } = require('../middleware/auth');
const authService = require('../services/auth');
const usage = require('../services/usage');
const { assertOwnsRecord } = require('../utils/studyContent');
const { reviewCard } = require('../utils/srs');
const FlashcardReview = require('../models/FlashcardReview');

const router = express.Router();

async function optionalUser(req) {
  return userFromRequest(req);
}

async function runAiJob(req, fn) {
  const user = await optionalUser(req);
  if (user && (user.isBanned || Number(user.is_banned))) {
    const error = new Error('This account has been disabled.');
    error.statusCode = 403;
    throw error;
  }
  const premium = authService.resolvePlan(user) === 'premium';
  return usage.runWithContext({ user, ip: req.ip, premium, calls: [] }, async () => {
    await usage.assertJobAllowed({ user, ip: req.ip, premium });
    const result = await fn({ user, premium });
    await usage.recordJob();
    const usageThisRun = usage.jobStats();
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      result.usageThisRun = usageThisRun;
    }
    return result;
  });
}

async function withUsageContext(req, fn) {
  const user = await optionalUser(req);
  const premium = authService.resolvePlan(user) === 'premium';
  return usage.runWithContext({ user, ip: req.ip, premium, calls: [] }, () => fn({ user, premium }));
}

// --- Process Uploaded Content ---
router.post('/process', async (req, res) => {
  try {
    const payload = await runAiJob(req, async ({ user, premium }) => {
  const userId = user ? Number(user.id) : null;
    const { 
        extractedText, originalFilename, originalContentType, outputFormats,
        summaryLengthPreference, summaryStylePreference,
        summaryKeywords: summaryKeywordsString, 
        summaryAudiencePurpose,
        summaryNegativeKeywords: summaryNegativeKeywordsString,
        quizOptions,
        visionImages,
    } = req.body;

    let sourceText = extractedText || '';
    const compact = sourceText.replace(/\s+/g, ' ').trim();
    const visionNeeded = Array.isArray(visionImages) && visionImages.length > 0 && compact.length < 250;
    if (visionNeeded) {
      try {
        const visionText = await aiService.extractTextFromImages(visionImages.slice(0, 3), { premium });
        sourceText = [sourceText, visionText].filter(Boolean).join('\n\n').trim();
      } catch (visionError) {
        console.warn('[/process] Vision extraction failed, continuing with existing text:', visionError.message);
      }
    }

    if (!sourceText || !originalFilename || !originalContentType || !outputFormats) {
      const error = new Error('Missing required fields for processing. Add a file, paste notes, or attach an image.');
      error.statusCode = 400;
      throw error;
    }
    if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
      const error = new Error('outputFormats must be a non-empty array.');
      error.statusCode = 400;
      throw error;
    }

    const summaryKeywordsArray = summaryKeywordsString 
        ? summaryKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];
    const summaryNegativeKeywordsArray = summaryNegativeKeywordsString 
        ? summaryNegativeKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];

    const results = await fileService.processUploadedText({
      extractedText: sourceText, 
      outputFormats, 
      originalFilename, 
      originalContentType, 
      userId, 
      summaryLengthPreference, 
      summaryStylePreference,
      summaryKeywords: summaryKeywordsArray,
      summaryAudiencePurpose,
      summaryNegativeKeywords: summaryNegativeKeywordsArray,
      quizOptions,
      premium,
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
    results.quizOptions = quizOptions;
    results.summaryKeywords = summaryKeywordsArray;
    return results;
    });
    res.status(200).json(payload);
  } catch (error) {
    console.error("[/process] Error in route handler:", error.message, error.stack ? error.stack.substring(0, 500) : '', error.originalError ? `Original Error: ${error.originalError.message}` : '');
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process content.', usage: error.usage });
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

        const result = await withUsageContext(req, ({ premium }) => aiService.getFlashcardInteractionResponse(card, interactionType, userAnswer, userQuery, chatHistory, { premium }));
        res.status(200).json(result);
    } catch (error) {
        console.error("[/flashcard-interact] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process flashcard interaction.' });
    }
});

// --- Quiz Generation and Interactions ---
router.post('/quiz-generate', async (req, res) => {
    try {
        const { extractedText, quizOptions } = req.body;
        if (!extractedText || !quizOptions || !Array.isArray(quizOptions.questionTypes) || quizOptions.questionTypes.length === 0) {
            return res.status(400).json({ message: 'Extracted text and valid quiz options (including questionTypes) are required.' });
        }
        const payload = await runAiJob(req, async ({ premium }) => {
          const quizData = await aiService.generateQuizWithOptions(extractedText, quizOptions, { premium });
          return { quiz: quizData, quizOptionsUsed: quizOptions };
        });
        res.status(200).json(payload);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message || 'Failed to generate quiz.', usage: error.usage });
    }
});

router.post('/quiz-answer-feedback', async (req, res) => {
    try {
        const { question, userAnswer } = req.body;
        if (!question || userAnswer === undefined) { // userAnswer can be null or empty string
            return res.status(400).json({ message: 'Question object and user answer are required.' });
        }
        const feedbackData = await withUsageContext(req, ({ premium }) => aiService.getQuizAnswerFeedback(question, userAnswer, { premium }));
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
        const explanationData = await withUsageContext(req, ({ premium }) => aiService.getQuizQuestionDetailedExplanation(question, { premium }));
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
        const chatResponseData = await withUsageContext(req, ({ premium }) => aiService.chatAboutQuizQuestion(question, chatHistory, userQuery, { premium }));
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
        const newQuestion = await withUsageContext(req, ({ premium }) => aiService.regenerateQuizQuestion(originalQuestion, textContext, difficultyHint, { premium }));
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
    assertOwnsRecord(existingSession.user_id, req.user.id);
    if (!existingSession.extracted_text) return res.status(400).json({ message: 'Original text for session not found, cannot regenerate.' });

    const summaryKeywordsArray = summaryKeywordsString 
        ? summaryKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];
    const summaryNegativeKeywordsArray = summaryNegativeKeywordsString 
        ? summaryNegativeKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];

    const parsedUpdatedSession = await runAiJob(req, async ({ premium }) => {
    const regeneratedResults = {};
    if (outputFormats.includes('summary') || outputFormats.includes('all')) {
      regeneratedResults.summary = await aiService.generateSummary(
          existingSession.extracted_text, 
          summaryLengthPreference, summaryStylePreference,
          summaryKeywordsArray, summaryAudiencePurpose,
          summaryNegativeKeywordsArray,
          { premium }
      );
    }
    if (outputFormats.includes('flashcards') || outputFormats.includes('all')) {
      const flashcardsArray = await aiService.generateFlashcards(existingSession.extracted_text, { premium: authService.resolvePlan(req.user) === 'premium' });
      regeneratedResults.flashcards = JSON.stringify(flashcardsArray);
    }
    if (outputFormats.includes('quiz') || outputFormats.includes('all')) {
      const currentQuizOptions = quizOptions || 
                                 (existingSession.quiz_options ? JSON.parse(existingSession.quiz_options) : null) ||
                                 { questionTypes: ['multiple_choice'], numQuestions: 'ai_choice', difficulty: 'medium' };
      
      if (!currentQuizOptions.questionTypes || currentQuizOptions.questionTypes.length === 0) {
        currentQuizOptions.questionTypes = ['multiple_choice'];
      }
      const quizArray = await aiService.generateQuizWithOptions(existingSession.extracted_text, currentQuizOptions, { premium: authService.resolvePlan(req.user) === 'premium' });
      regeneratedResults.quiz = JSON.stringify(quizArray);
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
    if (quizOptions) parsedUpdatedSession.quiz_options = quizOptions;
    return parsedUpdatedSession;
    });
    res.status(200).json({ updatedSession: parsedUpdatedSession });
  } catch (error) {
    console.error("[/sessions/:id/regenerate] Error:", error.message, error.stack ? error.stack.substring(0,300) : '');
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to regenerate content.', usage: error.usage });
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
    const explanation = await withUsageContext(req, ({ premium }) => aiService.explainTextSnippet(snippet, { premium }));
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
    assertOwnsRecord(session.user_id, req.user.id);
    
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

router.post('/practice', async (req, res) => {
  try {
    const { subject, topic, mode, difficulty, numQuestions } = req.body;
    if (!topic && !subject) {
      return res.status(400).json({ message: 'Choose a subject or enter a topic.' });
    }
    const payload = await runAiJob(req, async ({ premium }) => {
      const quiz = await aiService.generatePracticeSet({
        subject,
        topic,
        mode,
        difficulty,
        numQuestions,
      }, { premium });
      return { quiz, quizOptionsUsed: { subject, topic, mode, difficulty, numQuestions } };
    });
    res.status(200).json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to generate practice set.', usage: error.usage });
  }
});

router.post('/flashcard-review', authenticateToken, async (req, res) => {
  try {
    const { sessionId, card, quality } = req.body;
    if (!card || !card.term) {
      return res.status(400).json({ message: 'Flashcard data is required.' });
    }
    const existing = await FlashcardReview.findOne(req.user.id, sessionId || null, card.term);
    const next = reviewCard(existing || {}, quality);
    const saved = await FlashcardReview.upsert({
      userId: req.user.id,
      sessionId: sessionId || null,
      cardKey: card.term,
      term: card.term,
      review: next,
    });
    res.status(200).json({ review: saved });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to save review.' });
  }
});

router.get('/flashcard-reviews', authenticateToken, async (req, res) => {
  try {
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId, 10) : null;
    const reviews = await FlashcardReview.listDue(req.user.id, {
      sessionId: Number.isNaN(sessionId) ? null : sessionId,
      includeUpcoming: req.query.all === '1',
    });
    res.status(200).json({ reviews });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load reviews.' });
  }
});

module.exports = router;
