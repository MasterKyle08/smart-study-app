/**
 * @file backend/routes/study.routes.js
 * @description Routes for study material generation and session management.
 */

const express = require('express');
const multer = require('multer'); // For handling multipart/form-data (file uploads)
const fileService = require('../services/file');
const Session = require('../models/Session');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Multer setup for file uploads (in-memory storage for this example)
// For production, consider using diskStorage or cloud storage.
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB file size limit
});

/**
 * @route POST /api/study/process
 * @description Process uploaded text (from file or direct input) to generate study materials.
 * This route can be used by both anonymous and authenticated users.
 * If authenticated, the session will be linked to the user.
 * @access Public (authentication is optional, checked within)
 * @middleware May use authenticateToken if a token is provided, but doesn't require it.
 * @body {string} extractedText - Text content extracted by the client.
 * @body {string} originalFilename - Original name of the file.
 * @body {string} originalContentType - MIME type of the file.
 * @body {Array<string>} outputFormats - e.g., ['summary', 'flashcards', 'quiz', 'all']
 * @returns {object} 200 - { sessionId, summary?, flashcards?, quiz? }
 * @returns {object} 400 - Bad request (e.g., missing fields, empty text)
 * @returns {object} 500 - Internal server error (e.g., AI service failure, DB error)
 */
router.post('/process', async (req, res) => {
  // This route is public, but we check for an auth token to link session if user is logged in.
  // A more robust way is to have a separate optional auth middleware.
  let userId = null;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Verify user exists, similar to authenticateToken middleware logic
      const User = require('../models/User');
      const userExists = await User.findById(decoded.userId);
      if (userExists) {
        userId = decoded.userId;
      } else {
        console.warn("Token provided for /process route but user not found. Processing as anonymous.");
      }
    } catch (err) {
      // Invalid token, proceed as anonymous. Don't block processing.
      console.warn("Invalid token provided for /process route. Processing as anonymous.", err.message);
    }
  }

  try {
    const { extractedText, originalFilename, originalContentType, outputFormats } = req.body;

    if (!extractedText || !originalFilename || !originalContentType || !outputFormats) {
      return res.status(400).json({ message: 'Missing required fields: extractedText, originalFilename, originalContentType, outputFormats.' });
    }
    if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
        return res.status(400).json({ message: 'outputFormats must be a non-empty array.' });
    }


    const results = await fileService.processUploadedText({
      extractedText,
      outputFormats,
      originalFilename,
      originalContentType,
      userId, // Pass userId (can be null)
    });

    res.status(200).json(results);

  } catch (error) {
    console.error('Error in /process route:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to process content.' });
  }
});


// --- Routes below require authentication ---

/**
 * @route GET /api/study/sessions
 * @description Get all study sessions for the authenticated user.
 * @access Private (requires authentication)
 * @middleware authenticateToken
 * @returns {object} 200 - { sessions: [...] }
 * @returns {object} 500 - Internal server error
 */
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await Session.findByUserId(req.user.id);
    // Parse JSON strings for flashcards and quiz before sending to client
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

/**
 * @route GET /api/study/sessions/:id
 * @description Get a specific study session by ID for the authenticated user.
 * @access Private
 * @middleware authenticateToken
 * @param {string} id - Session ID.
 * @returns {object} 200 - { session: { ... } }
 * @returns {object} 403 - Forbidden (if session does not belong to user)
 * @returns {object} 404 - Not Found (if session doesn't exist)
 * @returns {object} 500 - Internal server error
 */
router.get('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) {
        return res.status(400).json({ message: 'Invalid session ID format.' });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    // Ensure the session belongs to the authenticated user
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You do not own this session.' });
    }
    
    // Parse JSON strings
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

/**
 * @route PUT /api/study/sessions/:id/regenerate
 * @description Regenerate AI content (summary, flashcards, quiz) for an existing session.
 * @access Private
 * @middleware authenticateToken
 * @param {string} id - Session ID.
 * @body {Array<string>} outputFormats - e.g., ['summary', 'flashcards', 'quiz', 'all']
 * @returns {object} 200 - { updatedSession: { ... } }
 * @returns {object} 400 - Bad request
 * @returns {object} 403 - Forbidden
 * @returns {object} 404 - Not Found
 * @returns {object} 500 - Internal server error
 */
router.put('/sessions/:id/regenerate', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) {
        return res.status(400).json({ message: 'Invalid session ID format.' });
    }
    const { outputFormats } = req.body;

    if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
      return res.status(400).json({ message: 'outputFormats array is required to regenerate content.' });
    }

    const existingSession = await Session.findById(sessionId);
    if (!existingSession) {
      return res.status(404).json({ message: 'Session not found.' });
    }
    if (existingSession.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You do not own this session.' });
    }

    // Use extractedText from the existing session
    const { extractedText } = existingSession;
    if (!extractedText) {
        return res.status(400).json({ message: 'Cannot regenerate. Original extracted text not found for this session.' });
    }

    const regeneratedResults = {};
    if (outputFormats.includes('summary') || outputFormats.includes('all')) {
      regeneratedResults.summary = await require('../services/ai').generateSummary(extractedText);
    }
    if (outputFormats.includes('flashcards') || outputFormats.includes('all')) {
      const flashcardsArray = await require('../services/ai').generateFlashcards(extractedText);
      regeneratedResults.flashcards = JSON.stringify(flashcardsArray); // Store as string
    }
    if (outputFormats.includes('quiz') || outputFormats.includes('all')) {
      const quizArray = await require('../services/ai').generateQuiz(extractedText);
      regeneratedResults.quiz = JSON.stringify(quizArray); // Store as string
    }
    
    const updatedSession = await Session.updateAiContent(sessionId, regeneratedResults);
     // Parse JSON strings for response
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
 * @route DELETE /api/study/sessions/:id
 * @description Delete a specific study session by ID for the authenticated user.
 * @access Private
 * @middleware authenticateToken
 * @param {string} id - Session ID.
 * @returns {object} 200 - { message: "Session deleted successfully." }
 * @returns {object} 403 - Forbidden (if session does not belong to user)
 * @returns {object} 404 - Not Found (if session doesn't exist or not owned by user)
 * @returns {object} 500 - Internal server error
 */
router.delete('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
     if (isNaN(sessionId)) {
        return res.status(400).json({ message: 'Invalid session ID format.' });
    }

    // Session.deleteById now includes userId check
    await Session.deleteById(sessionId, req.user.id);
    res.status(200).json({ message: 'Session deleted successfully.' });
  } catch (error) {
    console.error('Error deleting session:', error);
    // deleteById might throw if not found or not authorized
    if (error.message.includes('not found or user not authorized')) {
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete session.' });
  }
});


module.exports = router;
