/**
 * @file backend/services/auth.service.js
 * @description Service layer for authentication logic (registration, login).
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

function premiumEmails() {
  return (process.env.PREMIUM_USER_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function resolvePlan(user) {
  if (!user) return 'free';
  if (user.email && premiumEmails().includes(String(user.email).toLowerCase())) return 'premium';
  return user.plan === 'premium' ? 'premium' : 'free';
}

function publicUser(user) {
  const { isAdminUser } = require('../utils/adminRules');
  return {
    id: Number(user.id),
    email: user.email,
    plan: resolvePlan(user),
    isAdmin: isAdminUser(user),
    isBanned: Boolean(user.isBanned || user.is_banned),
  };
}

if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in auth.js. Please set it in your .env file.");
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

  const safeUser = publicUser(newUser);
  const token = jwt.sign({ userId: safeUser.id, email: safeUser.email, plan: safeUser.plan }, JWT_SECRET, { expiresIn: '7d' });

  return {
    user: safeUser,
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

  if (user.isBanned || Number(user.is_banned)) {
    const error = new Error(user.ban_reason ? `This account has been disabled. ${user.ban_reason}` : 'This account has been disabled.');
    error.statusCode = 403;
    throw error;
  }

  const safeUser = publicUser(user);
  const token = jwt.sign({ userId: safeUser.id, email: safeUser.email, plan: safeUser.plan }, JWT_SECRET, { expiresIn: '7d' });

  return {
    user: safeUser,
    token,
  };
}

module.exports = {
  registerUser,
  loginUser,
  resolvePlan,
  publicUser,
};
