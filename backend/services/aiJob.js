const auth = require('../middleware/auth');
const authService = require('./auth');
const usage = require('./usage');

const active = new Map();
let total = 0;
function attachSignal(req, res, next) {
  const controller = new AbortController();
  req.aiSignal = controller.signal;
  const abort = () => controller.abort();
  const disconnected = () => { if (!res.writableFinished) abort(); };
  req.once('aborted', abort);
  res.once('close', disconnected);
  res.once('finish', () => { req.removeListener('aborted', abort); res.removeListener('close', disconnected); });
  next();
}

async function run(req, fn, { action = false } = {}) {
  const user = req.user || await auth.userFromRequest(req);
  if (!user && auth.getTokenFromRequest(req)) throw Object.assign(new Error('Your session expired. Sign in again.'), { statusCode: 401 });
  if (user && (user.isBanned || Number(user.is_banned))) throw Object.assign(new Error('This account has been disabled.'), { statusCode: 403 });
  const premium = authService.resolvePlan(user) === 'premium';
  const key = usage.userKeyFrom(user, req.ip);
  if ((active.get(key) || 0) >= 2 || total >= 24) throw Object.assign(new Error('Too many AI tasks are running. Wait for your current task to finish.'), { statusCode: 429 });
  active.set(key, (active.get(key) || 0) + 1);
  total += 1;
  try {
    return await usage.runWithContext({ user, ip: req.ip, premium, signal: req.aiSignal, calls: [] }, async () => {
      try {
        if (req.aiSignal?.aborted) throw Object.assign(new Error('Request cancelled.'), { statusCode: 499 });
        if (action) await usage.reserveJob({ user, ip: req.ip, premium });
        const result = await fn({ user, premium });
        if (result && typeof result === 'object' && !Array.isArray(result)) result.usageThisRun = usage.jobStats();
        return result;
      } catch (error) {
        await usage.releaseUnusedJob().catch(() => {});
        throw error;
      }
    });
  } finally {
    const left = (active.get(key) || 1) - 1;
    if (left) active.set(key, left); else active.delete(key);
    total -= 1;
  }
}
module.exports = { run, attachSignal };
