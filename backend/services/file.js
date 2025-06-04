const Session = require('../models/Session');
const aiService = require('./ai');

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
    summaryNegativeKeywords = [],
    quizOptions 
}) {
  console.log("[fileService] processUploadedText called with quizOptions:", JSON.stringify(quizOptions, null, 2)); // Log entry and quizOptions

  if (!extractedText || extractedText.trim() === "") {
    const error = new Error('Extracted text cannot be empty.');
    error.statusCode = 400;
    throw error;
  }
  if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
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
      console.log("[fileService] Generating summary...");
      generatedSummary = await aiService.generateSummary(
          extractedText, 
          summaryLengthPreference, 
          summaryStylePreference,
          summaryKeywords,
          summaryAudiencePurpose,
          summaryNegativeKeywords
      );
      results.summary = generatedSummary;
      console.log("[fileService] Summary generation complete.");
    }

    if (outputFormats.includes('flashcards') || outputFormats.includes('all')) {
      console.log("[fileService] Generating flashcards...");
      generatedFlashcards = await aiService.generateFlashcards(extractedText);
      results.flashcards = generatedFlashcards;
      console.log("[fileService] Flashcards generation complete.");
    }

    if (outputFormats.includes('quiz') || outputFormats.includes('all')) {
        console.log("[fileService] Generating quiz with options:", JSON.stringify(quizOptions, null, 2));
        const currentQuizOptions = quizOptions || { 
            questionTypes: ['multiple_choice'], 
            numQuestions: 'ai_choice', 
            difficulty: 'medium' 
        };
        // Ensure quizOptions being passed are valid, especially questionTypes
        if (!currentQuizOptions.questionTypes || currentQuizOptions.questionTypes.length === 0) {
            console.warn("[fileService] No question types specified for quiz, defaulting to multiple_choice.");
            currentQuizOptions.questionTypes = ['multiple_choice'];
        }
        
        generatedQuiz = await aiService.generateQuizWithOptions(extractedText, currentQuizOptions);
        results.quiz = generatedQuiz; 
        console.log("[fileService] Quiz generation complete. Quiz data:", JSON.stringify(generatedQuiz, null, 2).substring(0, 200) + "..."); // Log part of the quiz data
    }
  } catch (aiError) {
    console.error("[fileService] AI generation failed:", aiError.message, aiError.stack ? aiError.stack.substring(0, 300) : '');
    const message = aiError.message.includes("API key") 
        ? "AI service is currently unavailable (configuration issue)."
        : `Failed to generate AI content: ${aiError.message}`;
    const error = new Error(message);
    error.statusCode = aiError.statusCode || 500;
    error.originalError = aiError; // Attach original error for more context if needed
    throw error; // Re-throw to be caught by the route handler
  }

  let newSession;
  try {
    console.log("[fileService] Creating session in DB with results:", { summary: !!generatedSummary, flashcards: !!generatedFlashcards, quiz: !!generatedQuiz });
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
    results.userId = userId; 
    results.summaryKeywords = summaryKeywords; 
    console.log("[fileService] Session created successfully with ID:", newSession.id);
  } catch (dbError) {
    console.error("[fileService] Error saving session to database:", dbError.message, dbError.stack ? dbError.stack.substring(0,300) : '');
    const error = new Error('Generated content, but failed to save session. Please try again.');
    error.statusCode = 500;
    error.originalError = dbError;
    throw error; // Re-throw to be caught by the route handler
  }
  
  console.log("[fileService] processUploadedText finished successfully. Returning results.");
  return results;
}

module.exports = {
  processUploadedText,
};
