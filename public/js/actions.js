// Declarative handlers work with a CSP that blocks inline JavaScript and eval.
const studyActions = new Set([
  "rateFlashcardSrs",
  "runQuizCodeSnippet",
  "handleQuizAnswerSubmission",
  "toggleDetailedExplanation",
  "toggleQuizQuestionChat",
  "handleQuizChatSend",
  "regenerateCurrentQuizQuestion",
  "jumpToQuizQuestion",
  "previousQuizQuestion",
  "nextQuizQuestion",
  "markQuestionForReview",
  "skipQuestion",
  "finishQuiz",
  "retryAllQuestions",
  "retryIncorrectQuestions",
  "startNewQuizSameSettings",
  "changeQuizSettingsAndStartNew",
  "generatePersonalizedQuizFromPremade",
]);
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action],[data-click-target]");
  if (!button || button.disabled) return;
  if (button.dataset.clickTarget) {
    document.getElementById(button.dataset.clickTarget)?.click();
    return;
  }
  const name = button.dataset.action;
  if (studyActions.has(name) && typeof window[name] === "function")
    window[name](
      ...(button.dataset.argument === undefined
        ? []
        : [Number(button.dataset.argument)]),
    );
});
for (const type of ["change", "input"])
  document.addEventListener(type, (event) => {
    const field = event.target;
    if (
      field.dataset.answerType &&
      ((field.dataset.answerType === "short_answer" && type === "input") ||
        (field.dataset.answerType !== "short_answer" && type === "change")) &&
      typeof window.handleQuizAnswerSelection === "function"
    )
      window.handleQuizAnswerSelection(field.value, field.dataset.answerType);
  });
