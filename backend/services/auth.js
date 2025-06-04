/**
 * @file backend/services/auth.service.js
 * @description Service layer for authentication logic (registration, login).
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Try to get JWT_SECRET from environment variables, otherwise use a fallback.
// IMPORTANT: For production, always use environment variables set by your hosting platform.
// The fallback is primarily for local development convenience if .env is missing.
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-super-secret-key-32-characters-long';
const SALT_ROUNDS = 10;

if (!JWT_SECRET || JWT_SECRET === 'your-fallback-super-secret-key-32-characters-long') {
  if (process.env.NODE_ENV === 'production') {
    console.error("FATAL ERROR: JWT_SECRET is not securely defined for production. Please set it as an environment variable in your hosting environment.");
    process.exit(1);
  } else {
    console.warn("Warning: JWT_SECRET is using a fallback value. For production, set a strong, unique JWT_SECRET in your environment variables.");
  }
}
if (JWT_SECRET.length < 32 && process.env.NODE_ENV === 'production') {
    console.error("FATAL ERROR: JWT_SECRET is not long enough for production. It must be at least 32 characters. Please set a strong one in your environment variables.");
    process.exit(1);
}


/**
 * Registers a new user.
 * @param {string} email - User's email.
 * @param {string} password - User's plain text password.
 * @returns {Promise<object>} An object containing the new user (id, email) and a JWT token.
 * @throws {Error} If email already exists or other registration error.
 */
async function registerUser(email, password) {
  // Validate email and password presence (basic)
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }
  // More sophisticated validation (e.g., email format, password strength) can be added here

  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    const error = new Error('Email already in use.');
    error.statusCode = 409; // Conflict
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const newUser = await User.create(email, passwordHash);

  const token = jwt.sign({ userId: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '1d' }); // Token expires in 1 day

  return {
    user: { id: newUser.id, email: newUser.email },
    token,
  };
}

/**
 * Logs in an existing user.
 * @param {string} email - User's email.
 * @param {string} password - User's plain text password.
 * @returns {Promise<object>} An object containing the user (id, email) and a JWT token.
 * @throws {Error} If invalid credentials or other login error.
 */
async function loginUser(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const user = await User.findByEmail(email);
  if (!user) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401; // Unauthorized
    throw error;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401; // Unauthorized
    throw error;
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

  return {
    user: { id: user.id, email: user.email },
    token,
  };
}

module.exports = {
  registerUser,
  loginUser,
};
