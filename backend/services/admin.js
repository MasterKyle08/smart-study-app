const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');
const PremadeQuiz = require('../models/PremadeQuiz');
const FlashcardReview = require('../models/FlashcardReview');
const { db } = require('../models/db');
const usage = require('./usage');
const otp = require('./otp');
const notify = require('./notify');
const gcpMonitoring = require('./gcpMonitoring');
const {
  isAdminUser,
  isOwnerEmail,
  normalizePhone,
  isValidE164,
  maskPhone,
  canChangeAdminRole,
  canDeleteUser,
  canBanUser,
} = require('../utils/adminRules');
const { adminSessionMs } = require('../utils/cookies');

const JWT_SECRET = process.env.JWT_SECRET;

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function publicAdminUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    email: user.email,
    plan: user.plan || 'free',
    role: isAdminUser(user) ? 'admin' : 'user',
    isAdmin: isAdminUser(user),
    isOwner: isOwnerEmail(user.email),
    isBanned: Boolean(user.isBanned || user.is_banned),
    bannedAt: user.banned_at || null,
    banReason: user.ban_reason || null,
    phoneMasked: user.phoneMasked || maskPhone(user.phone),
    phoneVerified: Boolean(Number(user.phone_verified)),
    createdAt: user.created_at,
  };
}

async function writeAudit({ actor, action, targetType, targetId, targetEmail, details, ip }) {
  await db.execute({
    sql: `INSERT INTO AdminAuditLog (actor_id, actor_email, action, target_type, target_id, target_email, details, ip)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      actor ? Number(actor.id) : null,
      actor ? actor.email : null,
      action,
      targetType || null,
      targetId == null ? null : String(targetId),
      targetEmail || null,
      details ? JSON.stringify(details) : null,
      ip || null,
    ],
  });
}

async function verifyPassword(user, password) {
  if (!password) throw httpError('Re-enter your password to continue.', 400);
  const authUser = await User.findAuthById(user.id);
  if (!authUser || !authUser.password_hash) throw httpError('Could not verify password.', 500);
  const ok = await bcrypt.compare(String(password), authUser.password_hash);
  if (!ok) throw httpError('Password is incorrect.', 401);
}

function signAdminToken(user) {
  return jwt.sign(
    { typ: 'admin', userId: Number(user.id), email: user.email },
    JWT_SECRET,
    { expiresIn: Math.floor(adminSessionMs() / 1000) }
  );
}

function readAdminToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.typ !== 'admin') return null;
    return decoded;
  } catch (_err) {
    return null;
  }
}

function gateStatus(user, adminToken) {
  const factor = otp.twoFactorStatus(user);
  const unlocked = Boolean(adminToken && Number(adminToken.userId) === Number(user.id));
  return {
    isAdmin: isAdminUser(user),
    isOwner: isOwnerEmail(user.email),
    unlocked,
    expiresAt: adminToken && adminToken.exp ? new Date(adminToken.exp * 1000).toISOString() : null,
    twoFactor: factor,
    smsConfigured: notify.smsConfigured(),
    emailConfigured: notify.emailConfigured(),
    sessionMinutes: Math.floor(adminSessionMs() / 60000),
  };
}

async function startUnlock(user, ip) {
  if (!isAdminUser(user)) throw httpError('Admin access required.', 403);
  const factor = otp.twoFactorStatus(user);
  if (factor.needsPhone && !Number(user.phone_verified)) {
    throw httpError('Add and verify a phone number before entering admin. SMS 2FA is required for admin accounts.', 400);
  }
  if (!factor.channel) {
    throw httpError('Admin 2FA is not configured. Set Twilio (SMS) or SMTP/Resend (email) on the server.', 503);
  }
  const destination = factor.channel === 'sms' ? user.phone : user.email;
  const issued = await otp.issue({
    user,
    purpose: 'admin_unlock',
    destination,
    channel: factor.channel === 'dev' ? 'dev' : factor.channel,
    ip,
  });
  await writeAudit({ actor: user, action: 'otp_requested', targetType: 'admin', targetId: user.id, targetEmail: user.email, details: { purpose: 'admin_unlock', channel: issued.channel }, ip });
  return issued;
}

async function confirmUnlock(user, code, ip) {
  if (!isAdminUser(user)) throw httpError('Admin access required.', 403);
  await otp.verify({ user, purpose: 'admin_unlock', code });
  await writeAudit({ actor: user, action: 'admin_unlocked', targetType: 'admin', targetId: user.id, targetEmail: user.email, ip });
  return signAdminToken(user);
}

async function startPhoneChange(user, rawPhone, ip) {
  if (!isAdminUser(user)) throw httpError('Admin access required.', 403);
  if (!notify.smsConfigured()) throw httpError('Twilio is not configured, so phone verification is unavailable.', 503);
  const phone = normalizePhone(rawPhone);
  if (!isValidE164(phone)) throw httpError('Enter a phone number with country code, e.g. +15551234567.', 400);
  const issued = await otp.issue({
    user,
    purpose: 'admin_phone',
    destination: phone,
    channel: 'sms',
    ip,
  });
  await writeAudit({ actor: user, action: 'phone_otp_requested', targetType: 'admin', targetId: user.id, targetEmail: user.email, details: { phone: maskPhone(phone) }, ip });
  return { ...issued, phoneMasked: maskPhone(phone) };
}

async function confirmPhoneChange(user, code, rawPhone, ip) {
  if (!isAdminUser(user)) throw httpError('Admin access required.', 403);
  await otp.verify({ user, purpose: 'admin_phone', code });
  const phone = normalizePhone(rawPhone);
  if (!isValidE164(phone)) throw httpError('Enter a valid phone number.', 400);
  await User.updateFields(user.id, { phone, phone_verified: 1 });
  await writeAudit({ actor: user, action: 'phone_verified', targetType: 'admin', targetId: user.id, targetEmail: user.email, details: { phone: maskPhone(phone) }, ip });
  return User.findById(user.id);
}

async function listUsers({ q, limit, offset }) {
  return (await User.search({ q, limit, offset })).map(publicAdminUser);
}

async function getUserDetail(userId) {
  const user = await User.findById(userId);
  if (!user) throw httpError('User not found.', 404);
  const sessions = await Session.findByUserId(user.id);
  const quizzes = await PremadeQuiz.listByUserId(user.id);
  const usageSnap = await usage.snapshot({ user, premium: user.plan === 'premium' });
  return {
    user: publicAdminUser(user),
    usage: usageSnap,
    quizzes,
    sessions: sessions.map((session) => ({
      id: session.id,
      originalFilename: session.original_filename,
      originalContentType: session.original_content_type,
      extractedText: session.extracted_text,
      summary: session.summary,
      flashcards: session.flashcards,
      quiz: session.quiz,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    })),
  };
}

async function setBan({ actor, targetId, banned, reason, password, ip }) {
  await verifyPassword(actor, password);
  const target = await User.findById(targetId);
  const allowed = canBanUser({ actor, target });
  if (!allowed.ok) throw httpError(allowed.reason, 400);
  const updated = await User.updateFields(target.id, {
    is_banned: banned ? 1 : 0,
    banned_at: banned ? new Date().toISOString() : null,
    ban_reason: banned ? String(reason || 'Banned by admin').slice(0, 300) : null,
  });
  await writeAudit({
    actor,
    action: banned ? 'user_banned' : 'user_unbanned',
    targetType: 'user',
    targetId: target.id,
    targetEmail: target.email,
    details: { reason: reason || null },
    ip,
  });
  return publicAdminUser(updated);
}

async function setPlan({ actor, targetId, plan, password, ip }) {
  await verifyPassword(actor, password);
  const target = await User.findById(targetId);
  if (!target) throw httpError('User not found.', 404);
  const next = plan === 'premium' ? 'premium' : 'free';
  const updated = await User.updateFields(target.id, { plan: next });
  await writeAudit({
    actor,
    action: 'plan_changed',
    targetType: 'user',
    targetId: target.id,
    targetEmail: target.email,
    details: { from: target.plan, to: next },
    ip,
  });
  return publicAdminUser(updated);
}

async function setRole({ actor, targetId, role, password, ip }) {
  await verifyPassword(actor, password);
  const target = await User.findById(targetId);
  const adminCount = await User.countAdmins();
  const nextRole = role === 'admin' ? 'admin' : 'user';
  const allowed = canChangeAdminRole({ actor, target, nextRole, adminCount });
  if (!allowed.ok) throw httpError(allowed.reason, 400);
  const updated = await User.updateFields(target.id, { role: nextRole });
  await writeAudit({
    actor,
    action: nextRole === 'admin' ? 'admin_promoted' : 'admin_demoted',
    targetType: 'user',
    targetId: target.id,
    targetEmail: target.email,
    ip,
  });
  try {
    await notify.notifyAdminPermissionChange({
      actorEmail: actor.email,
      targetEmail: target.email,
      action: nextRole === 'admin' ? 'promoted to admin' : 'removed admin access',
    });
  } catch (notifyError) {
    console.warn('Admin permission email failed:', notifyError.message);
  }
  return publicAdminUser(updated);
}

async function wipeUserData({ actor, targetId, password, confirm, ip }) {
  await verifyPassword(actor, password);
  const target = await User.findById(targetId);
  if (!target) throw httpError('User not found.', 404);
  if (String(confirm || '').trim().toLowerCase() !== 'wipe') {
    throw httpError('Type WIPE to confirm wiping this user’s stored study data.', 400);
  }
  const sessions = await Session.deleteByUserId(target.id);
  const reviews = await FlashcardReview.deleteByUserId(target.id);
  await db.execute({
    sql: 'DELETE FROM AiUsageDaily WHERE user_key = ?',
    args: [`user:${Number(target.id)}`],
  });
  await writeAudit({
    actor,
    action: 'user_data_wiped',
    targetType: 'user',
    targetId: target.id,
    targetEmail: target.email,
    details: { sessions, reviews },
    ip,
  });
  return { sessions, reviews };
}

async function deleteUserAccount({ actor, targetId, password, confirm, ip }) {
  await verifyPassword(actor, password);
  const target = await User.findById(targetId);
  const adminCount = await User.countAdmins();
  const allowed = canDeleteUser({ actor, target, adminCount });
  if (!allowed.ok) throw httpError(allowed.reason, 400);
  if (String(confirm || '').trim().toLowerCase() !== String(target.email).toLowerCase()) {
    throw httpError('Type the user’s email to confirm account deletion.', 400);
  }
  const sessions = await Session.deleteByUserId(target.id);
  const reviews = await FlashcardReview.deleteByUserId(target.id);
  const quizzes = await PremadeQuiz.deleteByUserId(target.id);
  await db.execute({
    sql: 'DELETE FROM AiUsageDaily WHERE user_key = ?',
    args: [`user:${Number(target.id)}`],
  });
  await db.execute({ sql: 'DELETE FROM AdminOtps WHERE user_id = ?', args: [target.id] });
  await User.deleteById(target.id);
  await writeAudit({
    actor,
    action: 'user_deleted',
    targetType: 'user',
    targetId: target.id,
    targetEmail: target.email,
    details: { sessions, reviews, quizzes },
    ip,
  });
  return { deleted: true, sessions, reviews, quizzes };
}

async function resetQuota({ actor, targetId, password, extraJobs, ip }) {
  await verifyPassword(actor, password);
  const target = await User.findById(targetId);
  if (!target) throw httpError('User not found.', 404);
  const snap = await usage.resetUserDay(target, extraJobs);
  await writeAudit({
    actor,
    action: extraJobs ? 'quota_bonus_granted' : 'quota_reset',
    targetType: 'user',
    targetId: target.id,
    targetEmail: target.email,
    details: { extraJobs: Number(extraJobs) || 0 },
    ip,
  });
  return snap;
}

async function listQuizzes({ search }) {
  return PremadeQuiz.listAll({ search, limit: 80 });
}

async function deleteQuiz({ actor, slug, password, confirm, ip }) {
  await verifyPassword(actor, password);
  const quiz = await PremadeQuiz.findBySlug(slug, { includePrivate: true });
  if (!quiz) throw httpError('Quiz not found.', 404);
  const expected = String(confirm || '').trim().toLowerCase();
  if (expected !== String(quiz.slug).toLowerCase() && expected !== 'delete') {
    throw httpError('Type the quiz slug or DELETE to confirm.', 400);
  }
  await PremadeQuiz.deleteByIdAdmin(quiz.id);
  await writeAudit({
    actor,
    action: 'premade_quiz_deleted',
    targetType: 'quiz',
    targetId: quiz.id,
    targetEmail: null,
    details: { slug: quiz.slug, title: quiz.title },
    ip,
  });
  return { deleted: true, slug: quiz.slug };
}

async function usageDashboard() {
  const day = usage.usageDate();
  const totals = await usage.totalsForDay(day);
  const recent = await db.execute({
    sql: `SELECT user_key, jobs, gemma_requests, premium_requests, input_tokens, output_tokens, ad_rewards, bonus_jobs
          FROM AiUsageDaily WHERE usage_date = ? ORDER BY jobs DESC LIMIT 25`,
    args: [day],
  });
  let google = { configured: false };
  try {
    google = await gcpMonitoring.getDailyGenerativeLanguageRequests();
  } catch (error) {
    google = { configured: gcpMonitoring.configured(), error: error.message };
  }
  return {
    selfCount: {
      gemmaUsed: totals.gemmaRequests,
      gemmaBudget: usage.GEMMA_DAILY_BUDGET,
      gemmaRemaining: Math.max(0, usage.GEMMA_DAILY_BUDGET - totals.gemmaRequests),
      estimatedInputTokens: totals.inputTokens,
      estimatedOutputTokens: totals.outputTokens,
      note: 'Google does not publish remaining quota to apps. This is Smart Study’s own count of Gemma 4 calls.',
    },
    topUsersToday: recent.rows.map((row) => ({
      key: row.user_key,
      jobs: Number(row.jobs) || 0,
      gemmaRequests: Number(row.gemma_requests) || 0,
      premiumRequests: Number(row.premium_requests) || 0,
      inputTokens: Number(row.input_tokens) || 0,
      outputTokens: Number(row.output_tokens) || 0,
      adRewards: Number(row.ad_rewards) || 0,
      bonusJobs: Number(row.bonus_jobs) || 0,
    })),
    googleCloud: google,
  };
}

async function listAudit({ limit = 80 } = {}) {
  const result = await db.execute({
    sql: `SELECT id, actor_id, actor_email, action, target_type, target_id, target_email, details, ip, created_at
          FROM AdminAuditLog ORDER BY id DESC LIMIT ?`,
    args: [Math.min(200, Number(limit) || 80)],
  });
  return result.rows.map((row) => ({
    id: Number(row.id),
    actorId: row.actor_id == null ? null : Number(row.actor_id),
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetEmail: row.target_email,
    details: (() => {
      try { return row.details ? JSON.parse(row.details) : null; } catch (_err) { return row.details; }
    })(),
    ip: row.ip,
    createdAt: row.created_at,
  }));
}

module.exports = {
  publicAdminUser,
  writeAudit,
  verifyPassword,
  signAdminToken,
  readAdminToken,
  gateStatus,
  startUnlock,
  confirmUnlock,
  startPhoneChange,
  confirmPhoneChange,
  listUsers,
  getUserDetail,
  setBan,
  setPlan,
  setRole,
  wipeUserData,
  deleteUserAccount,
  resetQuota,
  listQuizzes,
  deleteQuiz,
  usageDashboard,
  listAudit,
};
