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

// --- API Routes --- (MOVED UP - BEFORE express.static)
app.use('/api/auth', authRoutes);
app.use('/api/study', studyRoutes);

// Rate limiting middleware (applied to all API routes)
// This can stay here or be moved before API routes if preferred for earlier rejection.
app.use('/api/', rateLimitMiddleware);

// Serve static files from the 'public' directory (MOVED DOWN - AFTER API routes)
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
app.use((req, res, next) => {
  const error = new Error('Not Found');
  error.status = 404;
  next(error);
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  // Log the original URL that caused the 404 or error
  console.error(`Global Error Handler for URL: ${req.originalUrl}`);
  console.error('Error Message:', error.message);
  if (error.status === 404) {
    console.error('This was a 404 Not Found error.');
  } else {
    console.error('Error Stack:', error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'No stack available'); // Log first 5 lines of stack
  }
  
  res.status(error.status || 500);
  res.json({
    error: {
      message: error.message || 'An unexpected error occurred.',
      path: req.originalUrl, // Include path in response for client-side debugging
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
  });
});

module.exports = app;
