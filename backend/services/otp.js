const { sendSms, sendEmail, smsConfigured, emailConfigured } = require('./notify');
const { hashCode, safeEqual, generateCode } = require('../utils/otpCrypto');
const { writeTransaction } = require('../utils/transaction');
const { maskPhone } = require('../utils/adminRules');

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 60000;
const MAX_SENDS_PER_HOUR = 8;

function twoFactorStatus(user) {
  if (smsConfigured() && user?.phone && Number(user.phone_verified)) {
    return { channel: 'sms', destinationMasked: maskPhone(user.phone), needsPhone: false };
  }
  if (emailConfigured() || process.env.NODE_ENV !== 'production') {
    return { channel: emailConfigured() ? 'email' : 'dev', destinationMasked: user?.email || '', needsPhone: false };
  }
  return { channel: null, destinationMasked: '', needsPhone: false };
}

function fail(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }

async function issue({ user, purpose, destination, channel, ip }) {
  if (!user?.id) throw fail('Not signed in.', 401);
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await writeTransaction(async tx => {
    const sends = await tx.execute({ sql: "SELECT COUNT(*) AS c FROM AdminOtps WHERE user_id = ? AND purpose = ? AND datetime(created_at) >= datetime('now', '-1 hour')", args: [user.id, purpose] });
    if (Number(sends.rows[0].c) >= MAX_SENDS_PER_HOUR) throw fail('Too many verification codes. Try again in an hour.', 429);
    const previous = await tx.execute({ sql: 'SELECT created_at FROM AdminOtps WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1', args: [user.id, purpose] });
    const created = previous.rows[0]?.created_at;
    const age = created ? Date.now() - Date.parse(created.includes('T') ? created : created.replace(' ', 'T') + 'Z') : Infinity;
    if (age < RESEND_MS) throw fail('Wait ' + Math.ceil((RESEND_MS - age) / 1000) + ' seconds before requesting another code.', 429);
    await tx.execute({ sql: 'UPDATE AdminOtps SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL', args: [new Date().toISOString(), user.id, purpose] });
    await tx.execute({ sql: 'INSERT INTO AdminOtps (user_id, code_hash, purpose, destination, channel, expires_at, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [user.id, hashCode(code, user.id, purpose), purpose, destination, channel, expiresAt, ip || null, new Date().toISOString()] });
  });
  const message = 'Smart Study admin code: ' + code + '. Expires in 5 minutes. If you did not request this, ignore it and change your password.';
  if (channel === 'sms') await sendSms(destination, message);
  else if (channel === 'email') await sendEmail({ to: destination, subject: 'Smart Study admin verification code', text: message });
  else if (process.env.NODE_ENV !== 'production') console.warn('[admin-otp:dev] user ' + user.id + ' purpose=' + purpose + ' code=' + code);
  else throw fail('Verification delivery is unavailable.', 503);
  return { channel, expiresAt, destinationMasked: channel === 'sms' ? maskPhone(destination) : destination };
}

async function verify({ user, purpose, code, destination }) {
  const trimmed = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(trimmed)) throw fail('Enter the 6-digit code.');
  // Return failed verification errors after commit so attempt increments persist.
  const result = await writeTransaction(async tx => {
    const found = await tx.execute({ sql: 'SELECT * FROM AdminOtps WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1', args: [user.id, purpose] });
    const row = found.rows[0];
    if (!row) return { error: fail('No active code. Request a new one.') };
    if (Date.parse(row.expires_at) <= Date.now()) return { error: fail('That code expired. Request a new one.') };
    if (Number(row.attempts) >= MAX_ATTEMPTS) return { error: fail('Too many incorrect attempts. Request a new code.', 429) };
    const matches = safeEqual(hashCode(trimmed, user.id, purpose), row.code_hash) && (destination === undefined || destination === row.destination);
    if (!matches) {
      await tx.execute({ sql: 'UPDATE AdminOtps SET attempts = attempts + 1 WHERE id = ?', args: [row.id] });
      return { error: fail('Incorrect code or verification destination.', 401) };
    }
    const used = await tx.execute({ sql: 'UPDATE AdminOtps SET consumed_at = ?, attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND attempts < ?', args: [new Date().toISOString(), row.id, MAX_ATTEMPTS] });
    if (!used.rowsAffected) return { error: fail('That code has already been used.') };
    return { destination: row.destination };
  });
  if (result.error) throw result.error;
  return result;
}

module.exports = { issue, verify, twoFactorStatus, generateCode, hashCode, safeEqual };
