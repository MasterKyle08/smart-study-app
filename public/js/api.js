/**
 * @file public/js/api.js
 * @description Centralized API call functions for the frontend.
 */

const API_BASE_URL = '/api'; // Assuming backend is served from the same origin

/**
 * Performs a generic API request.
 * @param {string} endpoint - The API endpoint (e.g., '/auth/login').
 * @param {string} method - HTTP method (e.g., 'GET', 'POST', 'PUT', 'DELETE').
 * @param {object} [body=null] - Request body for POST/PUT requests.
 * @param {boolean} [requiresAuth=false] - Whether the request requires JWT authentication.
 * @returns {Promise<object>} The JSON response from the API.
 * @throws {Error} If the API request fails or returns an error status.
 */
async function request(endpoint, method, body = null, requiresAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (requiresAuth) {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      // Handle cases where auth is required but no token is found
      // This could redirect to login or throw a specific error
      console.warn(`Auth token not found for protected route: ${endpoint}`);
      // For now, let it proceed, backend will deny if token is truly required and missing/invalid
    }
  }

  const config = {
    method: method,
    headers: headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const responseData = await response.json();

    if (!response.ok) {
      // Log the detailed error from the backend if available
      console.error(`API Error (${response.status}) on ${method} ${endpoint}:`, responseData);
      const message = responseData.message || `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = responseData; // Attach full response data to the error
      throw error;
    }
    return responseData;
  } catch (error) {
    // Catch network errors or errors thrown from the !response.ok block
    console.error(`Network or application error on ${method} ${endpoint}:`, error);
    // Re-throw the error so it can be handled by the caller
    // Ensure it's an Error object
    if (!(error instanceof Error)) {
        throw new Error(error.message || 'An unknown network error occurred.');
    }
    throw error;
  }
}

// --- Specific API call functions ---

// Auth
const apiLogin = (email, password) => request('/auth/login', 'POST', { email, password });
const apiRegister = (email, password) => request('/auth/register', 'POST', { email, password });

// Study Processing
const apiProcessContent = (extractedText, originalFilename, originalContentType, outputFormats) => {
  // This route is public, but if a token exists, it will be sent.
  const token = localStorage.getItem('authToken');
  return request('/study/process', 'POST', {
    extractedText,
    originalFilename,
    originalContentType,
    outputFormats
  }, !!token); // requiresAuth is true if token exists
};


// Authenticated User Sessions
const apiGetUserSessions = () => request('/study/sessions', 'GET', null, true);
const apiGetSessionDetails = (sessionId) => request(`/study/sessions/${sessionId}`, 'GET', null, true);
const apiRegenerateSessionContent = (sessionId, outputFormats) => request(`/study/sessions/${sessionId}/regenerate`, 'PUT', { outputFormats }, true);
const apiDeleteSession = (sessionId) => request(`/study/sessions/${sessionId}`, 'DELETE', null, true);

// Expose functions if using modules, otherwise they are globally available in this script execution context
// For vanilla JS in separate files, ensure this script is loaded before others that use these functions.
