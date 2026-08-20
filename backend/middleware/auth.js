const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getTokenFromRequest, getAdminTokenFromRequest } = require('../utils/cookies');
const { isAdminUser } = require('../utils/adminRules');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined. Please set it in your .env file.');
  process.exit(1);
}

async function userFromRequest(req) {
  const token = getTokenFromRequest(req);
  if (!token || !JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    return user || null;
  } catch (_err) {
    return null;
  }
}

async function authenticateToken(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'Invalid token. User not found.' });
    }
    if (user.isBanned || Number(user.is_banned)) {
      return res.status(403).json({ message: 'This account has been disabled.' });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Invalid token.' });
    }
    console.error('JWT verification error:', error);
    return res.status(500).json({ message: 'Failed to authenticate token.' });
  }
}

function requireAdminRole(req, res, next) {
  if (!req.user || !isAdminUser(req.user)) {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
}

async function requireAdminSession(req, res, next) {
  if (!req.user || !isAdminUser(req.user)) {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  const adminService = require('../services/admin');
  const decoded = adminService.readAdminToken(getAdminTokenFromRequest(req));
  if (!decoded || Number(decoded.userId) !== Number(req.user.id)) {
    return res.status(401).json({
      message: 'Enter admin mode with a 2FA code first.',
      code: 'ADMIN_STEP_UP_REQUIRED',
    });
  }
  req.adminSession = decoded;
  next();
}

module.exports = authenticateToken;
module.exports.userFromRequest = userFromRequest;
module.exports.getTokenFromRequest = getTokenFromRequest;
module.exports.requireAdminRole = requireAdminRole;
module.exports.requireAdminSession = requireAdminSession;
