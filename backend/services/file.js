/**
 * @file backend/services/file.service.js
 * @description Service layer for file processing logic.
 */

const Session = require('../models/Session');
const aiService = require('./ai');

/**
 * Processes uploaded text to generate study materials.
 * @param {object} params - Parameters for processing.
 * @param {string} params.extractedText
 * @param {Array<string>} params.outputFormats
 * @param {string} params.originalFilename
 * @param {string} params.originalContentType
 * @param {number|null} params.userId
 * @param {string} [params.summaryLengthPreference='medium']
 * @param {string} [params.summaryStylePreference='paragraph']
 * @param {string[]} [params.summaryKeywords=[]]
 * @param {string} [params.summaryAudiencePurpose='']
 * @param {string[]} [params.summaryNegativeKeywords=[]]
 * @returns {Promise<object>}
 */
async function processUploadedText({ 
    extractedText, 
    outputFormats, 
    originalFilename, 
    originalContentType, 
    userId,
    summaryLengthPreference = 'medium',
    summaryStylePreference = 'paragraph',
    summaryKeywords = [],
    summaryAudiencePurpose = '',
    summaryNegativeKeywords = []
}) {
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
      console.log(`Generating summary for: ${originalFilename.substring(0,30)} with preferences...`);
      generatedSummary = await aiService.generateSummary(
          extractedText, 
          summaryLengthPreference, 
          summaryStylePreference,
          summaryKeywords,
          summaryAudiencePurpose,
          summaryNegativeKeywords
      );
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
    const message = aiError.message.includes("API key") 
        ? "AI service is currently unavailable (configuration issue)."
        : `Failed to generate AI content: ${aiError.message}`;
    const error = new Error(message);
    error.statusCode = aiError.statusCode || 500;
    throw error;
  }

  let newSession;
  try {
    newSession = await Session.create({
      userId: userId,
      originalFilename,
      originalContentType,
      extractedText,
      summary: generatedSummary,
      flashcards: generatedFlashcards ? JSON.stringify(generatedFlashcards) : null,
      quiz: generatedQuiz ? JSON.stringify(generatedQuiz) : null,
    });
    results.sessionId = newSession.id;
    // Pass back userId and keywords so frontend can decide on highlighting without re-fetching form
    results.userId = userId; 
    results.summaryKeywords = summaryKeywords; 
  } catch (dbError) {
    console.error('Error saving session to database:', dbError);
    const error = new Error('Generated content, but failed to save session. Please try again.');
    error.statusCode = 500;
    throw error;
  }
  
  return results;
}

module.exports = {
  processUploadedText,
};