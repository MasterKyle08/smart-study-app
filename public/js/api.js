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
  const config = { method, headers, credentials: 'include' };
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
      if ((response.status === 401 || response.status === 403) && requiresAuth) {
        localStorage.removeItem('userEmail');
        if (typeof window !== 'undefined' && typeof window.updateNav === 'function') {
          window.updateNav(false);
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          try {
            window.dispatchEvent(new CustomEvent('authTokenExpired', {
              detail: { endpoint, method, status: response.status, message },
            }));
          } catch (eventError) {
            // Older browsers may not support CustomEvent constructor without polyfill.
            const canCreateLegacyEvent = typeof document !== 'undefined' && typeof document.createEvent === 'function';
            const legacyEvent = canCreateLegacyEvent ? document.createEvent('CustomEvent') : null;
            if (legacyEvent && typeof legacyEvent.initCustomEvent === 'function') {
              legacyEvent.initCustomEvent('authTokenExpired', false, false, { endpoint, method, status: response.status, message });
              window.dispatchEvent(legacyEvent);
            }
          }
        }
      }
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
const apiGetCurrentUser = () => request('/auth/me', 'GET', null, true);
const apiLogout = () => request('/auth/logout', 'POST', {}, false);
const apiUsageStatus = () => request('/usage/status', 'GET');
const apiUsageQuota = () => request('/usage/quota', 'GET');
const apiAdReward = (granted) => request('/usage/ad-reward', 'POST', { granted: Boolean(granted) });

// --- Content Processing & Study Material Generation ---
const apiProcessContent = (
    extractedText, originalFilename, originalContentType, outputFormats, 
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords, quizOptions,
    visionImages
) => {
  const token = localStorage.getItem('authToken'); 
  return request('/study/process', 'POST', {
    extractedText, originalFilename, originalContentType, outputFormats,
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords, quizOptions,
    visionImages,
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
const hasAuthToken = () => !!localStorage.getItem('authToken');

const apiExplainSnippet = (snippet) => request('/study/explain-snippet', 'POST', { snippet }, hasAuthToken());

const apiFlashcardInteract = (card, interactionType, userAnswer, userQuery, chatHistory) => {
    return request('/study/flashcard-interact', 'POST', {
        card,
        interactionType,
        userAnswer,
        userQuery,
        chatHistory
    }, hasAuthToken());
};

const apiGenerateQuiz = (extractedText, quizOptions) => request('/study/quiz-generate', 'POST', { extractedText, quizOptions }, hasAuthToken());

const apiGetQuizAnswerFeedback = (question, userAnswer) => request('/study/quiz-answer-feedback', 'POST', { question, userAnswer }, hasAuthToken());

const apiGetQuizQuestionDetailedExplanation = (question) => request('/study/quiz-question-explanation', 'POST', { question }, hasAuthToken());

const apiChatAboutQuizQuestion = (question, chatHistory, userQuery) => request('/study/quiz-chat', 'POST', { question, chatHistory, userQuery }, hasAuthToken());

const apiRegenerateQuizQuestion = (originalQuestion, textContext, difficultyHint) => request('/study/quiz-regenerate-question', 'POST', { originalQuestion, textContext, difficultyHint }, hasAuthToken());

// --- Premade Quiz Library ---
const apiListPremadeQuizzes = (searchTerm) => {
  const query = searchTerm && searchTerm.trim() !== '' ? `?search=${encodeURIComponent(searchTerm.trim())}` : '';
  return request(`/premade${query}`, 'GET');
};
const apiGetPremadeQuiz = (slug) => request(`/premade/${slug}`, 'GET');
const apiCreatePremadeQuiz = (payload) => request('/premade', 'POST', payload, true);
const apiListMyPremadeQuizzes = () => request('/premade/mine/list', 'GET', null, true);
const apiUpdatePremadeQuiz = (slug, payload) => request(`/premade/${encodeURIComponent(slug)}`, 'PUT', payload, true);
const apiDeletePremadeQuiz = (slug) => request(`/premade/${encodeURIComponent(slug)}`, 'DELETE', null, true);
const apiGeneratePractice = (payload) => request('/study/practice', 'POST', payload, hasAuthToken());
const apiSaveFlashcardReview = (payload) => request('/study/flashcard-review', 'POST', payload, true);
const apiListFlashcardReviews = (sessionId, { dueOnly = false } = {}) => {
  const params = new URLSearchParams();
  if (sessionId) params.set('sessionId', sessionId);
  if (!dueOnly) params.set('all', '1');
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/study/flashcard-reviews${query}`, 'GET', null, true);
};
const apiBillingConfig = () => request('/billing/config', 'GET');
const apiCreateCheckout = (provider) => request('/billing/checkout', 'POST', { provider }, true);

const apiAdminStatus = () => request('/admin/status', 'GET', null, true);
const apiAdminUnlockStart = () => request('/admin/unlock/start', 'POST', {}, true);
const apiAdminUnlockConfirm = (code) => request('/admin/unlock/confirm', 'POST', { code }, true);
const apiAdminLock = () => request('/admin/lock', 'POST', {}, true);
const apiAdminPhoneStart = (phone) => request('/admin/phone/start', 'POST', { phone }, true);
const apiAdminPhoneConfirm = (code, phone) => request('/admin/phone/confirm', 'POST', { code, phone }, true);
const apiAdminUsers = (q) => request(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`, 'GET', null, true);
const apiAdminUser = (id) => request(`/admin/users/${id}`, 'GET', null, true);
const apiAdminUserBan = (id, password, reason) => request(`/admin/users/${id}/ban`, 'POST', { password, reason, banned: true }, true);
const apiAdminUserUnban = (id, password) => request(`/admin/users/${id}/unban`, 'POST', { password }, true);
const apiAdminUserPlan = (id, plan, password) => request(`/admin/users/${id}/plan`, 'POST', { plan, password }, true);
const apiAdminUserRole = (id, role, password) => request(`/admin/users/${id}/role`, 'POST', { role, password }, true);
const apiAdminUserWipe = (id, password, confirm) => request(`/admin/users/${id}/wipe`, 'POST', { password, confirm }, true);
const apiAdminUserDelete = (id, password, confirm) => request(`/admin/users/${id}/delete`, 'POST', { password, confirm }, true);
const apiAdminUserQuota = (id, password, extraJobs) => request(`/admin/users/${id}/quota`, 'POST', { password, extraJobs }, true);
const apiAdminQuizzes = (search) => request(`/admin/quizzes${search ? `?search=${encodeURIComponent(search)}` : ''}`, 'GET', null, true);
const apiAdminQuizDelete = (slug, password, confirm) => request(`/admin/quizzes/${encodeURIComponent(slug)}/delete`, 'POST', { password, confirm }, true);
const apiAdminUsage = () => request('/admin/usage', 'GET', null, true);
const apiAdminAudit = () => request('/admin/audit', 'GET', null, true);
