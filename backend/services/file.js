/**
 * @file backend/services/file.service.js
 * @description Service layer for file processing logic.
 * Currently, this mainly involves orchestrating AI processing and session saving.
 */

const Session = require('../models/Session');
const aiService = require('./ai');

/**
 * Processes uploaded text to generate study materials.
 * @param {object} params - Parameters for processing.
 * @param {string} params.extractedText - The text extracted from the uploaded file.
 * @param {Array<string>} params.outputFormats - Array of desired output formats (e.g., ['summary', 'flashcards', 'quiz']).
 * @param {string} params.originalFilename - Original name of the uploaded file.
 * @param {string} params.originalContentType - MIME type of the uploaded file.
 * @param {number|null} params.userId - ID of the authenticated user, or null for anonymous.
 * @returns {Promise<object>} An object containing the generated materials and session ID.
 * Example: { sessionId: 1, summary: "...", flashcards: [...], quiz: [...] }
 * @throws {Error} If processing fails.
 */
async function processUploadedText({ extractedText, outputFormats, originalFilename, originalContentType, userId }) {
  if (!extractedText || extractedText.trim() === "") {
    const error = new Error('Extracted text cannot be empty.');
    error.statusCode = 400;
    throw error;
  }
  if (!outputFormats || outputFormats.length === 0) {
    const error = new Error('At least one output format must be selected.');
    error.statusCode = 400;
    throw error;
  }

  const results = {};
  let generatedSummary = null;
  let generatedFlashcards = null;
  let generatedQuiz = null;

  try {
    if (outputFormats.includes('summary') || outputFormats.includes('all')) {
      console.log(`Generating summary for: ${originalFilename.substring(0,30)}...`);
      generatedSummary = await aiService.generateSummary(extractedText);
      results.summary = generatedSummary;
    }
    if (outputFormats.includes('flashcards') || outputFormats.includes('all')) {
      console.log(`Generating flashcards for: ${originalFilename.substring(0,30)}...`);
      generatedFlashcards = await aiService.generateFlashcards(extractedText);
      results.flashcards = generatedFlashcards;
    }
    if (outputFormats.includes('quiz') || outputFormats.includes('all')) {
      console.log(`Generating quiz for: ${originalFilename.substring(0,30)}...`);
      generatedQuiz = await aiService.generateQuiz(extractedText);
      results.quiz = generatedQuiz;
    }
  } catch (aiError) {
    console.error('AI generation failed:', aiError);
    // Construct a more user-friendly error message
    const message = aiError.message.includes("OpenAI API key") 
        ? "AI service is currently unavailable (configuration issue)."
        : `Failed to generate AI content: ${aiError.message}`;
    const error = new Error(message);
    error.statusCode = aiError.statusCode || 500; // Propagate status code if available
    throw error;
  }


  // Save session to database if user is authenticated or for anonymous (with null userId)
  // For anonymous users, this data won't be retrievable later unless we implement a temporary session ID system.
  // The current requirement is "Session data purged after browser close" for anonymous,
  // so we might not need to save anonymous sessions to DB unless we want to track usage or for other reasons.
  // However, the schema allows user_id to be NULL. Let's save it for now.
  // If it's an authenticated user, they can retrieve this later.
  
  let newSession;
  try {
    newSession = await Session.create({
      userId: userId, // Can be null for anonymous
      originalFilename,
      originalContentType,
      extractedText,
      summary: generatedSummary,
      // Store flashcards and quiz as JSON strings in the database
      flashcards: generatedFlashcards ? JSON.stringify(generatedFlashcards) : null,
      quiz: generatedQuiz ? JSON.stringify(generatedQuiz) : null,
    });
    results.sessionId = newSession.id;
    // If user is anonymous, results are returned to client and not persisted for them beyond current interaction.
    // If user is authenticated, this session is now linked to their account.
  } catch (dbError) {
    console.error('Error saving session to database:', dbError);
    // If AI generation succeeded but DB save failed, this is problematic.
    // For now, we'll still return the results to the user but indicate a save error.
    // In a more robust system, might queue for later save or handle differently.
    const error = new Error('Generated content, but failed to save session. Please try again.');
    error.statusCode = 500;
    // We can still return the results to the user even if saving fails.
    // The client will have the data for the current session.
    // results.saveError = "Failed to save this session to your history.";
    // For now, let's throw, as the client expects a session ID for some operations.
    throw error;
  }
  
  return results;
}

module.exports = {
  processUploadedText,
};
