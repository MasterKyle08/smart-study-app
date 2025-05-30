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

// Enable CORS for all routes and origins (adjust for production)
// app.use(cors()); // Typo corrected: app.use(require('cors')());
app.use(require('cors')());


// Body parsing middleware
app.use(express.json({ limit: '10mb' })); // For parsing application/json
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // For parsing application/x-www-form-urlencoded

// Rate limiting middleware (applied to all API routes)
app.use('/api/', rateLimitMiddleware);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/study', studyRoutes);

// --- Frontend Routes ---
// Serve index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Serve dashboard.html for the /dashboard path
// This route should ideally be protected or handled by client-side routing after login
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
  console.error('Global Error Handler:', error);
  res.status(error.status || 500);
  res.json({
    error: {
      message: error.message || 'An unexpected error occurred.',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
  });
});

module.exports = app;
