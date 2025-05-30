/**
 * @file backend/routes/study.routes.js
 * @description Routes for study material generation and session management.
 */

const express = require('express');
const fileService = require('../services/file');
const aiService = require('../services/ai'); 
const Session = require('../models/Session');
const authenticateToken = require('../middleware/auth'); // Still needed for other routes

const router = express.Router();

router.post('/process', async (req, res) => {
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
    } catch (err) { /* Ignore error, proceed as anonymous */ }
  }

  try {
    const { 
        extractedText, originalFilename, originalContentType, outputFormats,
        summaryLengthPreference, summaryStylePreference,
        summaryKeywords: summaryKeywordsString, 
        summaryAudiencePurpose,
        summaryNegativeKeywords: summaryNegativeKeywordsString 
    } = req.body;

    if (!extractedText || !originalFilename || !originalContentType || !outputFormats) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
        return res.status(400).json({ message: 'outputFormats must be a non-empty array.' });
    }

    const summaryKeywordsArray = summaryKeywordsString 
        ? summaryKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];
    const summaryNegativeKeywordsArray = summaryNegativeKeywordsString 
        ? summaryNegativeKeywordsString.split(',').map(k => k.trim()).filter(k => k) : [];

    const results = await fileService.processUploadedText({
      extractedText, outputFormats, originalFilename, originalContentType, userId, 
      summaryLengthPreference, summaryStylePreference,
      summaryKeywords: summaryKeywordsArray,
      summaryAudiencePurpose,
      summaryNegativeKeywords: summaryNegativeKeywordsArray
    });
    res.status(200).json(results);
  } catch (error) {
    console.error('Error in /process route:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process content.' });
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
        summaryNegativeKeywords: summaryNegativeKeywordsString 
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
      const quizArray = await aiService.generateQuiz(existingSession.extracted_text);
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
    console.error('Error regenerating session content:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to regenerate content.' });
  }
});

/**
 * @route POST /api/study/explain-snippet
 * @description Get an explanation for a text snippet.
 * @access Public (No authentication required)
 * @body {string} snippet - The text snippet to explain.
 * @returns {object} 200 - { explanation: "..." }
 */
router.post('/explain-snippet', async (req, res) => { // AuthenticateToken middleware REMOVED
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
    console.error('Error explaining snippet:', error);
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
    console.error('Error fetching user sessions:', error);
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
    console.error('Error fetching session by ID:', error);
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
    console.error('Error deleting session:', error);
    if (error.message.includes('not found or user not authorized')) {
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete session.' });
  }
});

module.exports = router;