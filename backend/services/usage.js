const { AsyncLocalStorage } = require('async_hooks');
const { db } = require('../models/db');
const { usageDate, estimateTokens, userKeyFrom } = require('../utils/usageMath');
const { writeTransaction } = require('../utils/transaction');

const usageStore = new AsyncLocalStorage();

const GEMMA_DAILY_BUDGET = parseInt(process.env.GEMMA_DAILY_BUDGET || '1500', 10);
const FREE_DAILY_JOBS = parseInt(process.env.FREE_DAILY_JOBS || '24', 10);
const ANON_DAILY_JOBS = parseInt(process.env.ANON_DAILY_JOBS || '10', 10);
const PREMIUM_DAILY_JOBS = parseInt(process.env.PREMIUM_DAILY_JOBS || '200', 10);
const AD_REWARDS_PER_DAY = parseInt(process.env.AD_REWARDS_PER_DAY || '2', 10);
const AD_COOLDOWN_HOURS = parseInt(process.env.AD_COOLDOWN_HOURS || '4', 10);
const JOBS_PER_AD = parseInt(process.env.JOBS_PER_AD || '1', 10);

function runWithContext(ctx, fn) {
  const store = { calls: [], ...ctx };
  return usageStore.run(store, fn);
}

function currentContext() {
  return usageStore.getStore() || null;
}

async function getRow(usageDay, userKey) {
  const result = await db.execute({
    sql: 'SELECT * FROM AiUsageDaily WHERE usage_date = ? AND user_key = ? LIMIT 1',
    args: [usageDay, userKey],
  });
  return result.rows[0] || null;
}

async function ensureRow(usageDay, userKey) {
  await db.execute({
    sql: `INSERT OR IGNORE INTO AiUsageDaily (usage_date, user_key, gemma_requests, premium_requests, jobs, input_tokens, output_tokens, ad_rewards, last_ad_at)
          VALUES (?, ?, 0, 0, 0, 0, 0, 0, NULL)`,
    args: [usageDay, userKey],
  });
  return getRow(usageDay, userKey);
}

async function totalsForDay(usageDay) {
  const result = await db.execute({
    sql: `SELECT
        COALESCE(SUM(gemma_requests), 0) AS gemma_requests,
        COALESCE(SUM(premium_requests), 0) AS premium_requests,
        COALESCE(SUM(jobs), 0) AS jobs,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens
      FROM AiUsageDaily WHERE usage_date = ?`,
    args: [usageDay],
  });
  const row = result.rows[0] || {};
  const pool = await db.execute({ sql: 'SELECT free_attempts FROM AiPoolDaily WHERE usage_date = ?', args: [usageDay] });
  return {
    gemmaRequests: Math.max(Number(row.gemma_requests) || 0, Number(pool.rows[0]?.free_attempts) || 0),
    premiumRequests: Number(row.premium_requests) || 0,
    jobs: Number(row.jobs) || 0,
    inputTokens: Number(row.input_tokens) || 0,
    outputTokens: Number(row.output_tokens) || 0,
  };
}

function jobLimit({ premium, user }) {
  if (premium) return PREMIUM_DAILY_JOBS;
  if (user && user.id) return FREE_DAILY_JOBS;
  return ANON_DAILY_JOBS;
}

async function snapshot({ user, ip, premium = false } = {}) {
  const day = usageDate();
  const key = userKeyFrom(user, ip);
  const mine = await getRow(day, key) || {};
  const global = await totalsForDay(day);
  const baseJobs = jobLimit({ premium, user });
  const adRewards = Number(mine.ad_rewards) || 0;
  const bonusJobs = Number(mine.bonus_jobs) || 0;
  const personalLimit = (premium ? PREMIUM_DAILY_JOBS : baseJobs + adRewards * JOBS_PER_AD) + bonusJobs;
  const jobsUsed = Number(mine.jobs) || 0;
  const gemmaUsed = global.gemmaRequests;
  const gemmaRemaining = Math.max(0, GEMMA_DAILY_BUDGET - gemmaUsed);

  return {
    resetTimezone: 'America/Los_Angeles',
    usageDate: day,
    community: {
      gemmaUsed,
      gemmaBudget: GEMMA_DAILY_BUDGET,
      gemmaRemaining,
      estimatedInputTokens: global.inputTokens,
      estimatedOutputTokens: global.outputTokens,
      note: 'Conservative count of free provider attempts, including retries. Actual Google project/model quotas can differ.',
    },
    you: {
      keyType: key.startsWith('user:') ? 'account' : 'visitor',
      plan: premium ? 'premium' : 'free',
      jobsUsed,
      jobsLimit: personalLimit,
      jobsRemaining: Math.max(0, personalLimit - jobsUsed),
      baseJobs,
      adRewards,
      bonusJobs,
      adsRemaining: premium ? 0 : Math.max(0, AD_REWARDS_PER_DAY - adRewards),
      lastAdAt: mine.last_ad_at || null,
      adCooldownHours: AD_COOLDOWN_HOURS,
      jobsPerAd: JOBS_PER_AD,
      requestsUsed: Number(mine.request_attempts) || 0,
      reservedTokens: Number(mine.reserved_tokens) || 0,
    },
  };
}

async function assertJobAllowed({ user, ip, premium = false } = {}) {
  const status = await snapshot({ user, ip, premium });
  if (!premium && status.community.gemmaRemaining <= 0) {
    const error = new Error('The shared free Gemma 4 pool for today is empty. It resets at midnight Pacific time. Premium uses a separate paid model.');
    error.statusCode = 429;
    error.usage = status;
    throw error;
  }
  if (status.you.jobsRemaining <= 0) {
    const extra = premium
      ? 'Your Premium daily study actions are used up.'
      : `You have used today's ${status.you.jobsLimit} free study actions. They reset at midnight Pacific.`;
    const error = new Error(extra);
    error.statusCode = 429;
    error.usage = status;
    throw error;
  }
  return status;
}

function jobStats() {
  const ctx = currentContext();
  const calls = (ctx && ctx.calls) || [];
  const inputTokens = calls.reduce((sum, call) => sum + (Number(call.inputTokens) || 0), 0);
  const outputTokens = calls.reduce((sum, call) => sum + (Number(call.outputTokens) || 0), 0);
  const apiExact = calls.some((call) => call.source === 'api');
  const estimateOnly = calls.length > 0 && calls.every((call) => call.source === 'estimate');
  return {
    requests: calls.length,
    inputTokens,
    outputTokens,
    source: estimateOnly ? 'estimate' : (apiExact ? 'api' : 'mixed'),
  };
}

async function recordRequest({ premium = false, inputTokens = 0, outputTokens = 0, source = 'estimate' } = {}) {
  const ctx = currentContext();
  const user = ctx && ctx.user;
  const ip = ctx && ctx.ip;
  const day = usageDate();
  const key = userKeyFrom(user, ip);
  if (ctx) {
    ctx.calls = ctx.calls || [];
    ctx.calls.push({
      inputTokens: Number(inputTokens) || 0,
      outputTokens: Number(outputTokens) || 0,
      premium: Boolean(premium),
      source,
    });
  }
  await ensureRow(day, key);
  const gemmaInc = premium ? 0 : 1;
  const premiumInc = premium ? 1 : 0;
  await db.execute({
    sql: `UPDATE AiUsageDaily
      SET gemma_requests = gemma_requests + ?,
          premium_requests = premium_requests + ?,
          input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?
      WHERE usage_date = ? AND user_key = ?`,
    args: [gemmaInc, premiumInc, inputTokens, outputTokens, day, key],
  });
}

async function recordJob() {
  const ctx = currentContext();
  if (!ctx) return;
  if (ctx.jobReservation) return; // Admission already reserved this action.
  const day = usageDate();
  const key = userKeyFrom(ctx.user, ctx.ip);
  await ensureRow(day, key);
  await db.execute({
    sql: `UPDATE AiUsageDaily SET jobs = jobs + 1 WHERE usage_date = ? AND user_key = ?`,
    args: [day, key],
  });
}

async function reserveJob({ user, ip, premium = false }) {
  const day = usageDate();
  const key = userKeyFrom(user, ip);
  const epoch = await writeTransaction(async tx => {
    await tx.execute({ sql: 'INSERT OR IGNORE INTO AiUsageDaily (usage_date, user_key) VALUES (?, ?)', args: [day, key] });
    const row = (await tx.execute({ sql: 'SELECT * FROM AiUsageDaily WHERE usage_date = ? AND user_key = ?', args: [day, key] })).rows[0];
    const limit = jobLimit({ user, premium }) + (premium ? 0 : Number(row.bonus_jobs || 0) + Number(row.ad_rewards || 0) * JOBS_PER_AD);
    const reserved = await tx.execute({ sql: 'UPDATE AiUsageDaily SET jobs = jobs + 1 WHERE usage_date = ? AND user_key = ? AND jobs < ?', args: [day, key, limit] });
    if (!reserved.rowsAffected) throw Object.assign(new Error('Your daily study actions are used up. They reset at midnight Pacific.'), { statusCode: 429 });
    return Number(row.budget_epoch || 0);
  });
  const ctx = currentContext();
  if (ctx) ctx.jobReservation = { day, key, epoch };
}

async function releaseUnusedJob() {
  const ctx = currentContext();
  if (!ctx?.jobReservation || ctx.providerAttempts) return;
  const { day, key, epoch } = ctx.jobReservation;
  await db.execute({ sql: 'UPDATE AiUsageDaily SET jobs = MAX(0, jobs - 1) WHERE usage_date = ? AND user_key = ? AND budget_epoch = ?', args: [day, key, epoch] });
  ctx.jobReservation = null;
}

async function reserveRequest(estimatedTokens, { premium }) {
  const ctx = currentContext();
  if (!ctx) throw Object.assign(new Error('AI requests must run within an authorized study action.'), { statusCode: 503 });
  const day = usageDate();
  const key = userKeyFrom(ctx.user, ctx.ip);
  const tokenLimit = Math.max(1, Number(process.env[premium ? 'PREMIUM_DAILY_TOKEN_BUDGET' : 'FREE_DAILY_TOKEN_BUDGET'] || (premium ? 1000000 : 200000)));
  const requestLimit = Math.max(1, Number(process.env[premium ? 'PREMIUM_DAILY_REQUESTS' : 'FREE_DAILY_REQUESTS'] || (premium ? 400 : (ctx.user ? 96 : 40))));
  const epoch = await writeTransaction(async tx => {
    await tx.execute({ sql: 'INSERT OR IGNORE INTO AiUsageDaily (usage_date, user_key) VALUES (?, ?)', args: [day, key] });
    const updated = await tx.execute({ sql: 'UPDATE AiUsageDaily SET request_attempts = request_attempts + 1, reserved_tokens = reserved_tokens + ? WHERE usage_date = ? AND user_key = ? AND request_attempts < ? AND reserved_tokens + ? <= ? RETURNING budget_epoch', args: [estimatedTokens, day, key, requestLimit, estimatedTokens, tokenLimit] });
    if (!updated.rows.length) throw Object.assign(new Error('Your daily AI request or token budget is exhausted. Try again after midnight Pacific.'), { statusCode: 429 });
    if (!premium) {
      await tx.execute({ sql: 'INSERT OR IGNORE INTO AiPoolDaily (usage_date, free_attempts) SELECT ?, COALESCE(SUM(gemma_requests), 0) FROM AiUsageDaily WHERE usage_date = ?', args: [day, day] });
      const pool = await tx.execute({ sql: 'UPDATE AiPoolDaily SET free_attempts = free_attempts + 1 WHERE usage_date = ? AND free_attempts < ?', args: [day, GEMMA_DAILY_BUDGET] });
      if (!pool.rowsAffected) throw Object.assign(new Error('The shared free AI pool is exhausted. It resets at midnight Pacific.'), { statusCode: 429 });
    }
    return Number(updated.rows[0].budget_epoch || 0);
  });
  return { day, key, estimatedTokens, premium, epoch };
}

function markProviderStart() {
  const ctx = currentContext();
  if (ctx) ctx.providerAttempts = (ctx.providerAttempts || 0) + 1;
}

async function releaseUnusedRequest(reservation) {
  if (!reservation) return;
  await writeTransaction(async tx => {
    await tx.execute({ sql: 'UPDATE AiUsageDaily SET request_attempts = MAX(0, request_attempts - 1), reserved_tokens = MAX(0, reserved_tokens - ?) WHERE usage_date = ? AND user_key = ? AND budget_epoch = ?', args: [reservation.estimatedTokens, reservation.day, reservation.key, reservation.epoch] });
    if (!reservation.premium) await tx.execute({ sql: 'UPDATE AiPoolDaily SET free_attempts = MAX(0, free_attempts - 1) WHERE usage_date = ?', args: [reservation.day] });
  });
}

async function reconcileRequest(reservation, data) {
  const meta = data.usageMetadata || data.usage_metadata;
  const actual = Number(meta?.totalTokenCount || meta?.total_token_count || 0);
  if (!reservation || !actual) return;
  await db.execute({ sql: 'UPDATE AiUsageDaily SET reserved_tokens = MAX(0, reserved_tokens + ?) WHERE usage_date = ? AND user_key = ? AND budget_epoch = ?', args: [actual - reservation.estimatedTokens, reservation.day, reservation.key, reservation.epoch] });
}

async function resetUserDay(user, extraJobs = 0) {
  const day = usageDate();
  const key = userKeyFrom(user, null);
  await ensureRow(day, key);
  const bonus = Math.max(0, parseInt(extraJobs, 10) || 0);
  await writeTransaction(async tx => {
    await tx.execute({ sql: 'UPDATE AiUsageDaily SET jobs = 0, request_attempts = 0, reserved_tokens = 0, budget_epoch = COALESCE(budget_epoch, 0) + 1, bonus_jobs = COALESCE(bonus_jobs, 0) + ? WHERE usage_date = ? AND user_key = ?', args: [bonus, day, key] });
  });
  return snapshot({ user, premium: false });
}

async function grantAdReward() {
  throw Object.assign(new Error('Ad rewards require trusted server verification and are currently unavailable.'), { statusCode: 501 });
}

module.exports = {
  usageDate,
  estimateTokens,
  userKeyFrom,
  runWithContext,
  currentContext,
  snapshot,
  totalsForDay,
  assertJobAllowed,
  recordRequest,
  jobStats,
  recordJob,
  reserveJob,
  releaseUnusedJob,
  reserveRequest,
  reconcileRequest,
  markProviderStart,
  releaseUnusedRequest,
  grantAdReward,
  resetUserDay,
  GEMMA_DAILY_BUDGET,
  FREE_DAILY_JOBS,
  ANON_DAILY_JOBS,
  PREMIUM_DAILY_JOBS,
  AD_REWARDS_PER_DAY,
  AD_COOLDOWN_HOURS,
  JOBS_PER_AD,
};
