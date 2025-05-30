/**
 * @file public/js/api.js
 * @description Centralized API call functions for the frontend.
 */

const API_BASE_URL = '/api'; 

async function request(endpoint, method, body = null, requiresAuth = false) {
  const headers = {'Content-Type': 'application/json'};
  if (requiresAuth) {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      // This warning is relevant for routes that strictly require auth.
      // If a route is public but can optionally use a token (like /process),
      // this warning might be benign if the user is simply not logged in.
      // The backend will ultimately decide if the lack of token is an issue.
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
    console.error(`API or Network error on ${method} ${endpoint}:`, error);
    if (!(error instanceof Error)) { 
        const newError = new Error(error.message || 'An unknown network or application error occurred.');
        throw newError;
    }
    throw error;
  }
}

// Auth
const apiLogin = (email, password) => request('/auth/login', 'POST', { email, password });
const apiRegister = (email, password) => request('/auth/register', 'POST', { email, password });

// Study Processing
const apiProcessContent = (
    extractedText, originalFilename, originalContentType, outputFormats, 
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords
) => {
  const token = localStorage.getItem('authToken'); 
  return request('/study/process', 'POST', {
    extractedText, originalFilename, originalContentType, outputFormats,
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords
  }, !!token); // Auth is optional; send token if available, requiresAuth will be true if token exists.
};

// Authenticated User Sessions
const apiGetUserSessions = () => request('/study/sessions', 'GET', null, true);
const apiGetSessionDetails = (sessionId) => request(`/study/sessions/${sessionId}`, 'GET', null, true);

const apiRegenerateSessionContent = (
    sessionId, outputFormats, 
    summaryLengthPreference, summaryStylePreference, summaryKeywords, 
    summaryAudiencePurpose, summaryNegativeKeywords
) => {
    const body = { outputFormats };
    if (summaryLengthPreference) body.summaryLengthPreference = summaryLengthPreference;
    if (summaryStylePreference) body.summaryStylePreference = summaryStylePreference;
    if (summaryKeywords !== undefined) body.summaryKeywords = summaryKeywords; 
    if (summaryAudiencePurpose) body.summaryAudiencePurpose = summaryAudiencePurpose;
    if (summaryNegativeKeywords !== undefined) body.summaryNegativeKeywords = summaryNegativeKeywords; 
    
    return request(`/study/sessions/${sessionId}/regenerate`, 'PUT', body, true);
};

const apiDeleteSession = (sessionId) => request(`/study/sessions/${sessionId}`, 'DELETE', null, true);

// Explain Snippet - now public, explicitly set requiresAuth to false
const apiExplainSnippet = (snippet) => request('/study/explain-snippet', 'POST', { snippet }, false);