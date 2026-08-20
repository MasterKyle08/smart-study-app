const { AsyncLocalStorage } = require('async_hooks');
const { db } = require('../models/db');
const { usageDate, estimateTokens, userKeyFrom } = require('../utils/usageMath');

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
  const existing = await getRow(usageDay, userKey);
  if (existing) return existing;
  await db.execute({
    sql: `INSERT INTO AiUsageDaily (usage_date, user_key, gemma_requests, premium_requests, jobs, input_tokens, output_tokens, ad_rewards, last_ad_at)
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
  return {
    gemmaRequests: Number(row.gemma_requests) || 0,
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
  const mine = await ensureRow(day, key);
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
      note: 'Google does not publish remaining quota to apps. This is Smart Study’s own count of Gemma 4 calls, capped to match the typical 1,500 free requests/day.',
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
      : `You have used today’s ${status.you.jobsLimit} free study actions. Watch a rewarded ad (max ${AD_REWARDS_PER_DAY}/day) for +${JOBS_PER_AD}, or upgrade to Premium.`;
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
  const day = usageDate();
  const key = userKeyFrom(ctx.user, ctx.ip);
  await ensureRow(day, key);
  await db.execute({
    sql: `UPDATE AiUsageDaily SET jobs = jobs + 1 WHERE usage_date = ? AND user_key = ?`,
    args: [day, key],
  });
}

async function resetUserDay(user, extraJobs = 0) {
  const day = usageDate();
  const key = userKeyFrom(user, null);
  await ensureRow(day, key);
  const bonus = Math.max(0, parseInt(extraJobs, 10) || 0);
  if (bonus) {
    await db.execute({
      sql: `UPDATE AiUsageDaily
            SET jobs = 0, bonus_jobs = COALESCE(bonus_jobs, 0) + ?
            WHERE usage_date = ? AND user_key = ?`,
      args: [bonus, day, key],
    });
  } else {
    await db.execute({
      sql: `UPDATE AiUsageDaily SET jobs = 0 WHERE usage_date = ? AND user_key = ?`,
      args: [day, key],
    });
  }
  return snapshot({ user, premium: false });
}

async function grantAdReward({ user, ip, premium = false } = {}) {
  if (premium) {
    const error = new Error('Premium accounts already have a large daily allowance. Ads are for free study actions.');
    error.statusCode = 400;
    throw error;
  }
  const day = usageDate();
  const key = userKeyFrom(user, ip);
  const row = await ensureRow(day, key);
  const rewards = Number(row.ad_rewards) || 0;
  if (rewards >= AD_REWARDS_PER_DAY) {
    const error = new Error(`You already used today’s ${AD_REWARDS_PER_DAY} ad extras. That cap exists so a few ads cannot empty the shared Gemma pool.`);
    error.statusCode = 429;
    throw error;
  }
  if (row.last_ad_at) {
    const last = new Date(row.last_ad_at).getTime();
    const waitMs = AD_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (Date.now() - last < waitMs) {
      const mins = Math.ceil((waitMs - (Date.now() - last)) / 60000);
      const error = new Error(`Ad extras need a ${AD_COOLDOWN_HOURS}-hour gap. Try again in about ${mins} minute(s).`);
      error.statusCode = 429;
      throw error;
    }
  }
  const global = await totalsForDay(day);
  if (global.gemmaRequests >= GEMMA_DAILY_BUDGET) {
    const error = new Error('The shared free Gemma pool is empty, so an extra action would still fail. Ads cannot create more Google free-tier requests.');
    error.statusCode = 429;
    throw error;
  }
  await db.execute({
    sql: `UPDATE AiUsageDaily SET ad_rewards = ad_rewards + 1, last_ad_at = ? WHERE usage_date = ? AND user_key = ?`,
    args: [new Date().toISOString(), day, key],
  });
  return snapshot({ user, ip, premium: false });
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
