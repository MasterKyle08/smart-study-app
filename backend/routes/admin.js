const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticateToken = require('../middleware/auth');
const { requireAdminRole, requireAdminSession } = require('../middleware/auth');
const { setAdminCookie, clearAdminCookie } = require('../utils/cookies');
const admin = require('../services/admin');

const router = express.Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many verification attempts. Try again later.' },
});

function handle(res, error) {
  const status = error.statusCode || 500;
  if (status >= 500) console.error('[admin]', error);
  res.status(status).json({ message: error.message || 'Admin request failed.' });
}

router.get('/status', authenticateToken, requireAdminRole, (req, res) => {
  const decoded = admin.readAdminToken(require('../utils/cookies').getAdminTokenFromRequest(req));
  res.json(admin.gateStatus(req.user, decoded));
});

router.post('/unlock/start', authenticateToken, requireAdminRole, otpLimiter, async (req, res) => {
  try {
    const issued = await admin.startUnlock(req.user, req.ip);
    res.json({
      message: issued.channel === 'sms'
        ? `A code was texted to ${issued.destinationMasked}.`
        : issued.channel === 'email'
          ? `A code was emailed to ${issued.destinationMasked}.`
          : 'A code was printed in the server log (development 2FA).',
      ...issued,
    });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/unlock/confirm', authenticateToken, requireAdminRole, otpLimiter, async (req, res) => {
  try {
    const token = await admin.confirmUnlock(req.user, req.body && req.body.code, req.ip);
    setAdminCookie(res, token);
    const decoded = admin.readAdminToken(token);
    res.json({
      message: 'Admin mode unlocked.',
      ...admin.gateStatus(req.user, decoded),
    });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/lock', authenticateToken, requireAdminRole, (req, res) => {
  clearAdminCookie(res);
  res.json({ message: 'Admin mode locked.' });
});

router.post('/phone/start', authenticateToken, requireAdminRole, otpLimiter, async (req, res) => {
  try {
    const issued = await admin.startPhoneChange(req.user, req.body && req.body.phone, req.ip);
    res.json({ message: `A code was texted to ${issued.phoneMasked}.`, ...issued });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/phone/confirm', authenticateToken, requireAdminRole, otpLimiter, async (req, res) => {
  try {
    const user = await admin.confirmPhoneChange(req.user, req.body && req.body.code, req.body && req.body.phone, req.ip);
    res.json({ message: 'Phone verified for admin 2FA.', user: admin.publicAdminUser(user) });
  } catch (error) {
    handle(res, error);
  }
});

router.get('/users', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const users = await admin.listUsers({ q: req.query.q, limit: req.query.limit, offset: req.query.offset });
    res.json({ users });
  } catch (error) {
    handle(res, error);
  }
});

router.get('/users/:id', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const detail = await admin.getUserDetail(req.params.id);
    res.json(detail);
  } catch (error) {
    handle(res, error);
  }
});

router.post('/users/:id/ban', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const user = await admin.setBan({
      actor: req.user,
      targetId: req.params.id,
      banned: req.body && req.body.banned !== false,
      reason: req.body && req.body.reason,
      password: req.body && req.body.password,
      ip: req.ip,
    });
    res.json({ user, message: user.isBanned ? 'User banned.' : 'User unbanned.' });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/users/:id/unban', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const user = await admin.setBan({
      actor: req.user,
      targetId: req.params.id,
      banned: false,
      password: req.body && req.body.password,
      ip: req.ip,
    });
    res.json({ user, message: 'User unbanned.' });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/users/:id/plan', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const user = await admin.setPlan({
      actor: req.user,
      targetId: req.params.id,
      plan: req.body && req.body.plan,
      password: req.body && req.body.password,
      ip: req.ip,
    });
    res.json({ user, message: `Plan set to ${user.plan}.` });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/users/:id/role', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const user = await admin.setRole({
      actor: req.user,
      targetId: req.params.id,
      role: req.body && req.body.role,
      password: req.body && req.body.password,
      ip: req.ip,
    });
    res.json({ user, message: user.isAdmin ? 'User promoted to admin.' : 'Admin access removed.' });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/users/:id/wipe', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const result = await admin.wipeUserData({
      actor: req.user,
      targetId: req.params.id,
      password: req.body && req.body.password,
      confirm: req.body && req.body.confirm,
      ip: req.ip,
    });
    res.json({ message: 'Stored study data wiped. Account kept.', ...result });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/users/:id/delete', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const result = await admin.deleteUserAccount({
      actor: req.user,
      targetId: req.params.id,
      password: req.body && req.body.password,
      confirm: req.body && req.body.confirm,
      ip: req.ip,
    });
    res.json({ message: 'Account deleted.', ...result });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/users/:id/quota', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const usage = await admin.resetQuota({
      actor: req.user,
      targetId: req.params.id,
      password: req.body && req.body.password,
      extraJobs: req.body && req.body.extraJobs,
      ip: req.ip,
    });
    res.json({ message: 'Quota updated.', usage });
  } catch (error) {
    handle(res, error);
  }
});

router.get('/quizzes', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const quizzes = await admin.listQuizzes({ search: req.query.search || req.query.q });
    res.json({ quizzes });
  } catch (error) {
    handle(res, error);
  }
});

router.post('/quizzes/:slug/delete', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const result = await admin.deleteQuiz({
      actor: req.user,
      slug: req.params.slug,
      password: req.body && req.body.password,
      confirm: req.body && req.body.confirm,
      ip: req.ip,
    });
    res.json({ message: 'Quiz deleted.', ...result });
  } catch (error) {
    handle(res, error);
  }
});

router.get('/usage', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const dashboard = await admin.usageDashboard();
    res.json(dashboard);
  } catch (error) {
    handle(res, error);
  }
});

router.get('/audit', authenticateToken, requireAdminSession, async (req, res) => {
  try {
    const entries = await admin.listAudit({ limit: req.query.limit });
    res.json({ entries });
  } catch (error) {
    handle(res, error);
  }
});

module.exports = router;
