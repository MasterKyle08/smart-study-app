const crypto = require('crypto');

function otpSecret() {
  return process.env.JWT_SECRET || 'otp-dev-secret';
}

function hashCode(code, userId, purpose) {
  return crypto.createHmac('sha256', otpSecret()).update(`${userId}:${purpose}:${code}`).digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

module.exports = { hashCode, safeEqual, generateCode };
