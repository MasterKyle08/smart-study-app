document.addEventListener('DOMContentLoaded', () => {
  if (typeof setCurrentYear === 'function') setCurrentYear('currentYearPractice');
  const form = document.getElementById('practiceForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const statusId = 'practiceStatus';
    const button = document.getElementById('practiceGenerateBtn');
    const payload = {
      subject: document.getElementById('practiceSubject').value,
      mode: document.getElementById('practiceMode').value,
      topic: document.getElementById('practiceTopic').value.trim(),
      difficulty: document.getElementById('practiceDifficulty').value,
      numQuestions: document.getElementById('practiceCount').value,
    };
    if (!payload.topic) {
      showMessage(statusId, 'Enter a topic so the questions stay focused.', 'warning', 4000);
      return;
    }
    button.disabled = true;
    button.textContent = 'Generating...';
    showProcessingStatus(statusId, 'Building a practice set... one AI request.', true);
    try {
      const response = await apiGeneratePractice(payload);
      if (!Array.isArray(response.quiz) || !response.quiz.length) {
        throw new Error('No questions came back. Try a more specific topic.');
      }
      window.currentQuizSessionType = 'standard';
      window.currentQuizData = response.quiz.map((question) => ({
        ...question,
        chatHistory: [],
        detailedExplanationContent: null,
        detailedExplanationFetched: false,
        aiFeedback: null,
        correctness: null,
        previousStateBeforeMark: null,
        isExplanationVisible: false,
        isChatVisible: false,
      }));
      window.originalFullQuizData = JSON.parse(JSON.stringify(window.currentQuizData));
      window.currentQuizQuestionIndex = 0;
      window.userQuizAnswers = new Array(window.currentQuizData.length).fill(null);
      window.quizQuestionStates = new Array(window.currentQuizData.length).fill('unanswered');
      window.currentQuizTextContext = `${payload.subject}: ${payload.topic}`;
      window.currentExtractedTextForQuiz = window.currentQuizTextContext;
      renderQuizInterface();
      document.getElementById('quizInterfaceContainer').classList.remove('hidden');
      document.getElementById('quizResultsContainer').classList.add('hidden');
      hideProcessingStatus(statusId);
      const run = response.usageThisRun;
      const extra = run && run.requests
        ? ` This run: ${run.requests} request(s), ${Number(run.inputTokens).toLocaleString()} in / ${Number(run.outputTokens).toLocaleString()} out.`
        : '';
      showMessage(statusId, `${response.quiz.length} questions ready.${extra}`, 'success', 5000);
      if (typeof window.refreshUsageMeter === 'function') window.refreshUsageMeter(run);
    } catch (error) {
      showMessage(statusId, error.message || 'Could not generate practice questions.', 'error', 6000);
    } finally {
      button.disabled = false;
      button.textContent = 'Generate practice set';
    }
  });
});
