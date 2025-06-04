const API_BASE_URL = '/api'; 

async function request(endpoint, method, body = null, requiresAuth = false) {
  const headers = {'Content-Type': 'application/json'};
  if (requiresAuth) {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      console.warn(`Auth token not found for a request where requiresAuth is true: ${endpoint}`);
    }
  }
  const config = { method, headers };
  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const responseData = await response.json(); 
    if (!response.ok) {
      const message = responseData.message || `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status; 
      error.data = responseData; 
      throw error;
    }
    return responseData;
  } catch (error) { 
    if (!(error instanceof Error)) { 
        const newError = new Error(error.message || 'An unknown network or application error occurred.');
        throw newError;
    }
    throw error;
  }
}

const apiLogin = (email, password) => request('/auth/login', 'POST', { email, password });
const apiRegister = (email, password) => request('/auth/register', 'POST', { email, password });

const apiProcessContent = (
    extractedText, originalFilename, originalContentType, outputFormats, 
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords, quizOptions
) => {
  const token = localStorage.getItem('authToken'); 
  return request('/study/process', 'POST', {
    extractedText, originalFilename, originalContentType, outputFormats,
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords, quizOptions,
    extractedText // Ensure extractedText is part of the payload for quiz generation fallback
  }, !!token); 
};

const apiGetUserSessions = () => request('/study/sessions', 'GET', null, true);
const apiGetSessionDetails = (sessionId) => request(`/study/sessions/${sessionId}`, 'GET', null, true);

const apiRegenerateSessionContent = (
    sessionId, outputFormats, 
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords, quizOptions
) => {
    const body = { outputFormats };
    if (summaryLengthPreference) body.summaryLengthPreference = summaryLengthPreference;
    if (summaryStylePreference) body.summaryStylePreference = summaryStylePreference;
    if (summaryKeywords !== undefined) body.summaryKeywords = summaryKeywords; 
    if (summaryAudiencePurpose) body.summaryAudiencePurpose = summaryAudiencePurpose;
    if (summaryNegativeKeywords !== undefined) body.summaryNegativeKeywords = summaryNegativeKeywords; 
    if (quizOptions) body.quizOptions = quizOptions;
    
    return request(`/study/sessions/${sessionId}/regenerate`, 'PUT', body, true);
};

const apiDeleteSession = (sessionId) => request(`/study/sessions/${sessionId}`, 'DELETE', null, true);
const apiExplainSnippet = (snippet) => request('/study/explain-snippet', 'POST', { snippet }, false);
const apiFlashcardInteract = (card, interactionType, userAnswer, userQuery, chatHistory) => {
    return request('/study/flashcard-interact', 'POST', {
        card,
        interactionType,
        userAnswer,
        userQuery,
        chatHistory
    }, false); 
};

const apiGenerateQuiz = (extractedText, quizOptions) => request('/study/quiz-generate', 'POST', { extractedText, quizOptions });
const apiGetQuizAnswerFeedback = (question, userAnswer) => request('/study/quiz-answer-feedback', 'POST', { question, userAnswer });
const apiGetQuizQuestionDetailedExplanation = (question) => request('/study/quiz-question-explanation', 'POST', { question });
const apiChatAboutQuizQuestion = (question, chatHistory, userQuery) => request('/study/quiz-chat', 'POST', { question, chatHistory, userQuery });
const apiRegenerateQuizQuestion = (originalQuestion, textContext, difficultyHint) => request('/study/quiz-regenerate-question', 'POST', { originalQuestion, textContext, difficultyHint });
