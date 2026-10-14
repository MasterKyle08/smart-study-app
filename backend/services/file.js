const Session = require("../models/Session");
const aiService = require("./ai");
const { selectSource } = require("../utils/source");

async function processUploadedText({
  extractedText,
  outputFormats,
  originalFilename,
  originalContentType,
  userId,
  summaryLengthPreference = "medium",
  summaryStylePreference = "paragraph",
  summaryKeywords = [],
  summaryAudiencePurpose = "",
  summaryNegativeKeywords = [],
  quizOptions,
  premium = false,
  signal,
}) {
  if (!extractedText || extractedText.trim() === "") {
    const error = new Error("Extracted text cannot be empty.");
    error.statusCode = 400;
    throw error;
  }
  if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
    const error = new Error("At least one output format must be selected.");
    error.statusCode = 400;
    throw error;
  }

  const aiOptions = { premium };
  const wantsSummary =
    outputFormats.includes("summary") || outputFormats.includes("all");
  const wantsFlashcards =
    outputFormats.includes("flashcards") || outputFormats.includes("all");
  const wantsQuiz =
    outputFormats.includes("quiz") || outputFormats.includes("all");

  const results = {
    warnings: [],
  };
  let generatedSummary = null;
  let generatedFlashcards = null;
  let generatedQuiz = null;
  const tasks = [];
  const failures = [];

  const bundleFreeOutputs =
    !premium &&
    [wantsSummary, wantsFlashcards, wantsQuiz].filter(Boolean).length > 1;
  if (bundleFreeOutputs) {
    tasks.push(async () => {
      try {
        const materials = await aiService.generateStudyMaterials(
          extractedText,
          {
            wantsSummary,
            wantsFlashcards,
            wantsQuiz,
            summaryLengthPreference,
            summaryStylePreference,
            summaryKeywords,
            summaryAudiencePurpose,
            summaryNegativeKeywords,
            quizOptions: quizOptions || {},
          },
          aiOptions,
        );
        Object.assign(results, materials);
        generatedSummary = materials.summary || null;
        generatedFlashcards = materials.flashcards || null;
        generatedQuiz = materials.quiz || null;
      } catch (aiError) {
        console.error(
          "[fileService] Study material generation failed:",
          aiError.message,
        );
        results.warnings.push(aiError.message);
        failures.push(aiError);
      }
    });
  }

  if (wantsSummary && !bundleFreeOutputs) {
    tasks.push(async () => {
      try {
        generatedSummary = await aiService.generateSummary(
          extractedText,
          summaryLengthPreference,
          summaryStylePreference,
          summaryKeywords,
          summaryAudiencePurpose,
          summaryNegativeKeywords,
          aiOptions,
        );
        results.summary = generatedSummary;
      } catch (aiError) {
        console.error(
          "[fileService] Summary generation failed:",
          aiError.message,
        );
        results.warnings.push(`Summary: ${aiError.message}`);
        failures.push(aiError);
      }
    });
  }

  if (wantsFlashcards && !bundleFreeOutputs) {
    tasks.push(async () => {
      try {
        generatedFlashcards = await aiService.generateFlashcards(
          extractedText,
          aiOptions,
        );
        results.flashcards = generatedFlashcards;
      } catch (aiError) {
        console.error(
          "[fileService] Flashcard generation failed:",
          aiError.message,
        );
        results.warnings.push(`Flashcards: ${aiError.message}`);
        failures.push(aiError);
      }
    });
  }

  if (wantsQuiz && !bundleFreeOutputs) {
    tasks.push(async () => {
      try {
        const currentQuizOptions = quizOptions || {
          questionTypes: ["multiple_choice"],
          numQuestions: "ai_choice",
          difficulty: "medium",
        };
        if (
          !currentQuizOptions.questionTypes ||
          currentQuizOptions.questionTypes.length === 0
        ) {
          currentQuizOptions.questionTypes = ["multiple_choice"];
        }
        generatedQuiz = await aiService.generateQuizWithOptions(
          extractedText,
          currentQuizOptions,
          aiOptions,
        );
        results.quiz = generatedQuiz;
      } catch (aiError) {
        console.error("[fileService] Quiz generation failed:", aiError.message);
        results.warnings.push(`Quiz: ${aiError.message}`);
        failures.push(aiError);
      }
    });
  }

  // Premium outputs can overlap; free multi-output uploads use one task.
  let taskIndex = 0;
  async function worker() {
    while (taskIndex < tasks.length) {
      const task = tasks[taskIndex++];
      await task();
    }
  }
  await Promise.all([worker(), worker()]);
  if (signal?.aborted)
    throw Object.assign(new Error("Request cancelled."), { statusCode: 499 });
  if (
    generatedQuiz &&
    !results.warnings.some((warning) =>
      warning.startsWith("Quiz: The AI returned"),
    ) &&
    quizOptions?.numQuestions &&
    quizOptions.numQuestions !== "ai_choice" &&
    generatedQuiz.length <
      Math.min(Number(quizOptions.numQuestions), premium ? 15 : 10)
  )
    results.warnings.push(
      `Quiz: The AI returned ${generatedQuiz.length} of ${Math.min(Number(quizOptions.numQuestions), premium ? 15 : 10)} requested questions.`,
    );
  const coverage = selectSource(extractedText, premium ? 40000 : 14000).warning;
  if (coverage) results.warnings.push(coverage);
  results.citations = require("../utils/citations").attach(
    extractedText,
    results,
  );
  if (
    (generatedQuiz || generatedFlashcards) &&
    !results.citations.some((item) => !item.related)
  )
    results.warnings.push(
      "No exact supporting quotes were verified for these generated questions/cards. Check them against your notes.",
    );

  if (!generatedSummary && !generatedFlashcards && !generatedQuiz) {
    const error = new Error(
      results.warnings.join(" ") || "Failed to generate any study materials.",
    );
    error.statusCode =
      failures.length && failures.every((item) => item.statusCode === 429)
        ? 429
        : 502;
    throw error;
  }

  results.userId = userId || null;
  results.summaryKeywords = summaryKeywords;
  results.plan = premium ? "premium" : "free";

  if (!userId) {
    results.sessionId = null;
    results.savedToAccount = false;
    return results;
  }

  try {
    if (signal?.aborted)
      throw Object.assign(new Error("Request cancelled."), { statusCode: 499 });
    const newSession = await Session.create({
      userId,
      originalFilename,
      originalContentType,
      extractedText,
      summary: generatedSummary,
      flashcards: generatedFlashcards
        ? JSON.stringify(generatedFlashcards)
        : null,
      quiz: generatedQuiz ? JSON.stringify(generatedQuiz) : null,
      quizOptions,
      citations: results.citations,
    });
    results.sessionId = newSession.id;
    results.savedToAccount = true;
  } catch (dbError) {
    if (dbError.statusCode === 499) throw dbError;
    console.error(
      "[fileService] Error saving session to database:",
      dbError.message,
    );
    results.sessionId = null;
    results.savedToAccount = false;
    results.warnings.push(
      "Materials were generated but could not be saved to your dashboard.",
    );
  }

  return results;
}

module.exports = {
  processUploadedText,
};
