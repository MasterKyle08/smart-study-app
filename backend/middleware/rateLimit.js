/**
 * @file backend/middleware/rateLimit.middleware.js
 * @description Middleware for API rate limiting.
 */

const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15', 10) * 60 * 1000; // Default 15 minutes
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10); // Default 100 requests per windowMs

/**
 * API rate limiter configuration.
 */
const apiRateLimiter = rateLimit({
  windowMs: windowMs,
  max: maxRequests,
  message: {
    status: 429,
    message: 'Too many requests, please try again later.',
  },
  headers: true, // Send X-RateLimit-Limit and X-RateLimit-Remaining headers
  standardHeaders: 'draft-7', // Use 'RateLimit-*' headers according to RFC draft
  legacyHeaders: false, // Do not send X-RateLimit-* headers (use standardHeaders instead)
  keyGenerator: (req) => {
    // Use IP address as the key for rate limiting
    // Consider more sophisticated key generation for distributed environments
    return req.ip;
  },
  handler: (req, res, next, options) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(options.statusCode).send(options.message);
  }
});

module.exports = apiRateLimiter;
