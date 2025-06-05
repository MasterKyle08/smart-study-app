/**
 * @file backend/app.js
 * @description Configures the Express application, including middleware and routes.
 */

const express = require('express');
const path = require('path');
const rateLimitMiddleware = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const studyRoutes = require('./routes/study');

const app = express();

// --- Middleware ---

app.use(require('cors')());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' })); 

// --- Favicon Route ---
// Handle /favicon.ico requests to prevent 404 errors in logs if no favicon is present
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/study', studyRoutes);

// Rate limiting middleware (applied to all API routes)
app.use('/api/', rateLimitMiddleware);

// Serve static files from the 'public' directory (MOVED DOWN - AFTER API routes and favicon)
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Frontend Routes ---
// Serve index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Serve dashboard.html for the /dashboard path
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});


// --- Error Handling ---

// Catch 404 and forward to error handler
// This should come after all other specific routes
app.use((req, res, next) => {
  // Check if the request was for an API route that wasn't matched
  if (req.originalUrl.startsWith('/api/')) {
    const error = new Error('API Endpoint Not Found');
    error.status = 404;
    return next(error); // Pass to the global error handler for API 404s
  }
  // For non-API routes that were not caught by static serving or specific frontend routes,
  // it's often best to redirect to index.html for SPAs, or handle as a 404 if that's preferred.
  // For this setup, assuming unhandled non-API routes might be client-side routing attempts
  // or actual missing frontend resources. If it's truly a missing *file* the static handler
  // would have 404'd already. If it's a "route" like /some/unknown/page, for an SPA you'd
  // often serve index.html. Here, we'll treat it as a generic 404.
  const error = new Error('Page Not Found');
  error.status = 404;
  next(error);
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  // Log the original URL that caused the error
  console.error(`Global Error Handler for URL: ${req.originalUrl}`);
  console.error('Error Message:', error.message);
  if (error.status === 404) {
    console.error('This was a 404 Not Found error.');
  } else {
    // Log only a few lines of stack for non-404 errors to keep logs cleaner
    console.error('Error Stack (partial):', error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'No stack available');
  }
  
  res.status(error.status || 500);
  res.json({
    error: {
      message: error.message || 'An unexpected server error occurred.',
      path: req.originalUrl, // Include path in response for client-side debugging
      // Only include stack in development environment for security reasons
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
  });
});

module.exports = app;
