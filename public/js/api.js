/**
 * @file public/js/api.js
 * @description API wrapper functions for frontend to backend communication.
 */

const API_BASE_URL = '/api'; 

/**
 * Generic request function to interact with the backend API.
 * @param {string} endpoint - The API endpoint (e.g., '/auth/login').
 * @param {string} method - HTTP method (e.g., 'GET', 'POST', 'PUT', 'DELETE').
 * @param {object|null} [body=null] - The request body for POST/PUT requests.
 * @param {boolean} [requiresAuth=false] - Whether the request requires an authentication token.
 * @returns {Promise<object>} A promise that resolves with the JSON response from the API.
 * @throws {Error} If the request fails or the response is not OK.
 */
async function request(endpoint, method, body = null, requiresAuth = false) {
  const headers = {'Content-Type': 'application/json'};
  if (requiresAuth) {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      // This warning is for development; in a real app, you might redirect to login
      // or the backend would return a 401 which the error handling below would catch.
      console.warn(`Auth token not found for an authenticated request to: ${endpoint}`);
    }
  }
  
  const config = { method, headers };
  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    // Try to parse JSON regardless of status, as error responses often contain JSON messages.
    const responseData = await response.json().catch(() => ({ 
        message: `Request to ${endpoint} failed with status ${response.status} and non-JSON response.` 
    }));
    
    if (!response.ok) {
      const message = responseData.message || `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status; 
      error.data = responseData; // Attach full response data for more context
      console.error(`API Error (${error.status}) for ${method} ${endpoint}:`, error.message, error.data);
      throw error;
    }
    return responseData;
  } catch (error) { 
    // Ensure that we are always throwing an actual Error object
    if (!(error instanceof Error)) { 
        const newError = new Error(error.message || 'An unknown network or application error occurred.');
        newError.originalError = error; // Store the original non-Error value if needed
        console.error(`Network/Application Error for ${method} ${endpoint}:`, newError.message, newError.originalError);
        throw newError;
    }
    // If it's already an Error instance (e.g., from the !response.ok block), just re-throw.
    throw error;
  }
}

// --- Authentication ---
const apiLogin = (email, password) => request('/auth/login', 'POST', { email, password });
const apiRegister = (email, password) => request('/auth/register', 'POST', { email, password });

// --- Content Processing & Study Material Generation ---
const apiProcessContent = (
    extractedText, originalFilename, originalContentType, outputFormats, 
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords, quizOptions // quizOptions is now an object
) => {
  const token = localStorage.getItem('authToken'); 
  return request('/study/process', 'POST', {
    extractedText, originalFilename, originalContentType, outputFormats,
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords, quizOptions // Pass the structured quizOptions
  }, !!token); 
};

// --- Session Management ---
const apiGetUserSessions = () => request('/study/sessions', 'GET', null, true);
const apiGetSessionDetails = (sessionId) => request(`/study/sessions/${sessionId}`, 'GET', null, true);

const apiRegenerateSessionContent = (
    sessionId, outputFormats, 
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords, quizOptions // Pass quizOptions for regeneration
) => {
    const body = { 
        outputFormats,
        summaryLengthPreference,
        summaryStylePreference,
        summaryKeywords,
        summaryAudiencePurpose,
        summaryNegativeKeywords,
        quizOptions // Include quizOptions in the body
    };
    // Remove undefined fields to keep payload clean
    Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);
    
    return request(`/study/sessions/${sessionId}/regenerate`, 'PUT', body, true);
};

const apiDeleteSession = (sessionId) => request(`/study/sessions/${sessionId}`, 'DELETE', null, true);

// --- Snippet Explanation ---
const apiExplainSnippet = (snippet) => request('/study/explain-snippet', 'POST', { snippet }, false);

// --- Interactive Flashcard Endpoints ---
const apiFlashcardInteract = (card, interactionType, userAnswer, userQuery, chatHistory) => {
    return request('/study/flashcard-interact', 'POST', {
        card,
        interactionType,
        userAnswer, // Can be null
        userQuery,  // Can be null
        chatHistory // Array
    }, false); // Assuming auth is handled by session context if needed, not per interaction here
};

// --- Interactive Quiz Endpoints ---
// For generating a new quiz based on text and options
const apiGenerateQuiz = (extractedText, quizOptions) => request('/study/quiz-generate', 'POST', { extractedText, quizOptions });

// For getting feedback on a specific answer
const apiGetQuizAnswerFeedback = (question, userAnswer) => request('/study/quiz-answer-feedback', 'POST', { question, userAnswer });

// For getting a detailed explanation of a question/answer
const apiGetQuizQuestionDetailedExplanation = (question) => request('/study/quiz-question-explanation', 'POST', { question });

// For chatting about a specific quiz question
const apiChatAboutQuizQuestion = (question, chatHistory, userQuery) => request('/study/quiz-chat', 'POST', { question, chatHistory, userQuery });

// For regenerating a specific quiz question
const apiRegenerateQuizQuestion = (originalQuestion, textContext, difficultyHint) => request('/study/quiz-regenerate-question', 'POST', { originalQuestion, textContext, difficultyHint });
