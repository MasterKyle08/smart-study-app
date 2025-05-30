/**
 * @file backend/routes/auth.routes.js
 * @description Authentication routes (register, login).
 */

const express = require('express');
const authService = require('../services/auth.js');

const router = express.Router();

/**
 * @route POST /api/auth/register
 * @description Register a new user.
 * @access Public
 * @body {string} email - User's email.
 * @body {string} password - User's password.
 * @returns {object} 201 - { user: { id, email }, token }
 * @returns {object} 400 - Bad request (e.g., missing fields)
 * @returns {object} 409 - Conflict (e.g., email already exists)
 * @returns {object} 500 - Internal server error
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    // Add more validation for email format and password strength if needed
    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    const result = await authService.registerUser(email, password);
    res.status(201).json(result);
  } catch (error) {
    console.error('Registration error:', error.message);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'An error occurred during registration.' });
  }
});

/**
 * @route POST /api/auth/login
 * @description Log in an existing user.
 * @access Public
 * @body {string} email - User's email.
 * @body {string} password - User's password.
 * @returns {object} 200 - { user: { id, email }, token }
 * @returns {object} 400 - Bad request (e.g., missing fields)
 * @returns {object} 401 - Unauthorized (invalid credentials)
 * @returns {object} 500 - Internal server error
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const result = await authService.loginUser(email, password);
    res.status(200).json(result);
  } catch (error) {
    console.error('Login error:', error.message);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'An error occurred during login.' });
  }
});

module.exports = router;
