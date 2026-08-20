const { db } = require('../models/db');
const { sendSms, sendEmail, smsConfigured, emailConfigured } = require('./notify');
const { hashCode, safeEqual, generateCode } = require('../utils/otpCrypto');

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 8;

function twoFactorStatus(user) {
  const smsReady = smsConfigured() && user && user.phone && Number(user.phone_verified);
  if (smsReady) return { channel: 'sms', destinationMasked: require('../utils/adminRules').maskPhone(user.phone), needsPhone: false };
  if (emailConfigured() || process.env.NODE_ENV !== 'production') {
    return { channel: emailConfigured() ? 'email' : 'dev', destinationMasked: user && user.email ? user.email : '', needsPhone: smsConfigured() };
  }
  return { channel: null, destinationMasked: '', needsPhone: smsConfigured() };
}

async function recentSendCount(userId, purpose) {
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM AdminOtps
          WHERE user_id = ? AND purpose = ? AND created_at >= datetime('now', '-1 hour')`,
    args: [userId, purpose],
  });
  return Number(result.rows[0] && result.rows[0].c) || 0;
}

async function lastSend(userId, purpose) {
  const result = await db.execute({
    sql: `SELECT created_at FROM AdminOtps WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1`,
    args: [userId, purpose],
  });
  return result.rows[0] || null;
}

async function issue({ user, purpose, destination, channel, ip }) {
  if (!user || !user.id) {
    const error = new Error('Not signed in.');
    error.statusCode = 401;
    throw error;
  }
  const sends = await recentSendCount(user.id, purpose);
  if (sends >= MAX_SENDS_PER_HOUR) {
    const error = new Error('Too many verification codes. Try again in an hour.');
    error.statusCode = 429;
    throw error;
  }
  const previous = await lastSend(user.id, purpose);
  if (previous && previous.created_at) {
    const age = Date.now() - new Date(previous.created_at).getTime();
    if (Number.isFinite(age) && age < RESEND_MS) {
      const wait = Math.ceil((RESEND_MS - age) / 1000);
      const error = new Error(`Wait ${wait} second(s) before requesting another code.`);
      error.statusCode = 429;
      throw error;
    }
  }

  const code = generateCode();
  const codeHash = hashCode(code, user.id, purpose);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await db.execute({
    sql: `UPDATE AdminOtps SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
    args: [new Date().toISOString(), user.id, purpose],
  });
  await db.execute({
    sql: `INSERT INTO AdminOtps (user_id, code_hash, purpose, destination, channel, expires_at, ip)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [user.id, codeHash, purpose, destination || null, channel || null, expiresAt, ip || null],
  });

  const message = `Smart Study admin code: ${code}. Expires in 5 minutes. If you did not request this, ignore it and change your password.`;
  if (channel === 'sms') {
    await sendSms(destination, message);
  } else if (channel === 'email') {
    await sendEmail({ to: destination, subject: 'Smart Study admin verification code', text: message });
  } else {
    console.warn(`[admin-otp:dev] user ${user.id} purpose=${purpose} code=${code}`);
  }

  return {
    channel: channel === 'sms' ? 'sms' : (channel === 'email' ? 'email' : 'dev'),
    expiresAt,
    destinationMasked: channel === 'sms'
      ? require('../utils/adminRules').maskPhone(destination)
      : destination,
  };
}

async function verify({ user, purpose, code }) {
  const trimmed = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(trimmed)) {
    const error = new Error('Enter the 6-digit code.');
    error.statusCode = 400;
    throw error;
  }
  const result = await db.execute({
    sql: `SELECT * FROM AdminOtps
          WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
          ORDER BY id DESC LIMIT 1`,
    args: [user.id, purpose],
  });
  const row = result.rows[0];
  if (!row) {
    const error = new Error('No active code. Request a new one.');
    error.statusCode = 400;
    throw error;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const error = new Error('That code expired. Request a new one.');
    error.statusCode = 400;
    throw error;
  }
  const attempts = Number(row.attempts) || 0;
  if (attempts >= MAX_ATTEMPTS) {
    const error = new Error('Too many incorrect attempts. Request a new code.');
    error.statusCode = 429;
    throw error;
  }
  const expected = hashCode(trimmed, user.id, purpose);
  if (!safeEqual(expected, row.code_hash)) {
    await db.execute({
      sql: 'UPDATE AdminOtps SET attempts = attempts + 1 WHERE id = ?',
      args: [row.id],
    });
    const error = new Error('Incorrect code.');
    error.statusCode = 401;
    throw error;
  }
  await db.execute({
    sql: 'UPDATE AdminOtps SET consumed_at = ?, attempts = attempts + 1 WHERE id = ?',
    args: [new Date().toISOString(), row.id],
  });
  return true;
}

module.exports = {
  issue,
  verify,
  twoFactorStatus,
  generateCode,
  hashCode,
  safeEqual,
};
