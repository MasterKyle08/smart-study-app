const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { gcpRequestCountFilter } = require('../utils/adminRules');

function loadServiceAccount() {
  const inline = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch (error) {
      throw new Error('GCP_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
  }
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_FILE;
  if (!keyPath) return null;
  const resolved = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account file not found: ${keyPath}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function projectIdFrom(sa) {
  return process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || (sa && sa.project_id) || '';
}

function configured() {
  try {
    const sa = loadServiceAccount();
    return Boolean(sa && projectIdFrom(sa));
  } catch (_err) {
    return false;
  }
}

function toBase64Url(obj) {
  return Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url({ alg: 'RS256', typ: 'JWT' });
  const payload = toBase64Url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/monitoring.read',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(sa.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || 'Could not get Google Cloud access token.');
    error.statusCode = 502;
    throw error;
  }
  return data.access_token;
}

function pacificStartOfDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  // Midnight Pacific as an absolute instant approximated via ISO with offset lookup.
  const date = `${get('year')}-${get('month')}-${get('day')}T00:00:00`;
  const utcGuess = new Date(`${date}Z`);
  const laAsUtc = new Date(utcGuess.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const offset = utcGuess.getTime() - laAsUtc.getTime();
  return new Date(utcGuess.getTime() + offset);
}

async function getDailyGenerativeLanguageRequests() {
  const sa = loadServiceAccount();
  if (!sa) {
    return {
      configured: false,
      used: null,
      limit: parseInt(process.env.GEMMA_DAILY_BUDGET || '1500', 10),
      note: 'Set GCP_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS (service account JSON) to pull live Cloud Monitoring stats. This never runs in the browser.',
    };
  }
  const projectId = projectIdFrom(sa);
  const token = await getAccessToken(sa);
  const start = pacificStartOfDay();
  const end = new Date();
  const filter = gcpRequestCountFilter();
  const params = new URLSearchParams({
    filter,
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': '60s',
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
    view: 'FULL',
  });
  const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      configured: true,
      used: null,
      projectId,
      error: data.error && data.error.message ? data.error.message : `Monitoring API ${response.status}`,
      filter,
      note: 'Cloud Monitoring often lags by a few minutes (sometimes up to ~30). Enable the Monitoring API and grant roles/monitoring.viewer on the service account.',
    };
  }
  let total = 0;
  const series = data.timeSeries || [];
  series.forEach((item) => {
    (item.points || []).forEach((point) => {
      const value = point.value || {};
      total += parseInt(value.int64Value || value.doubleValue || 0, 10) || 0;
    });
  });
  return {
    configured: true,
    used: total,
    limit: parseInt(process.env.GEMMA_DAILY_BUDGET || '1500', 10),
    projectId,
    filter,
    sampledPeriod: '60s',
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    note: 'This is Google Cloud Monitoring’s count of Generative Language API requests (generativelanguage.googleapis.com). It is not the same as AI Studio’s remaining-quota widget, and it typically lags by 1–30 minutes. Treat it as a check against Smart Study’s own request counter, not as a live remaining-quota API.',
  };
}

const CACHE_MS = Math.max(30, parseInt(process.env.GCP_MONITORING_CACHE_SECONDS || '90', 10)) * 1000;
let quotaCache = { at: 0, value: null };

function publicQuotaView(googleResult, selfUsed, limit) {
  const cap = Number(limit) || parseInt(process.env.GEMMA_DAILY_BUDGET || '1500', 10);
  const own = Number(selfUsed) || 0;
  const googleReady = Boolean(
    googleResult
    && googleResult.configured
    && googleResult.used != null
    && Number.isFinite(Number(googleResult.used))
    && !googleResult.error
  );
  const used = googleReady ? Number(googleResult.used) : own;
  return {
    used,
    limit: cap,
    remaining: Math.max(0, cap - used),
    source: googleReady ? 'google-cloud-monitoring' : 'smart-study',
    googleConfigured: Boolean(googleResult && googleResult.configured),
    selfUsed: own,
  };
}

async function getCachedDailyGenerativeLanguageRequests() {
  if (!configured()) {
    return {
      configured: false,
      used: null,
      limit: parseInt(process.env.GEMMA_DAILY_BUDGET || '1500', 10),
    };
  }
  if (quotaCache.value && Date.now() - quotaCache.at < CACHE_MS) {
    return quotaCache.value;
  }
  try {
    const value = await getDailyGenerativeLanguageRequests();
    quotaCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    if (quotaCache.value) return quotaCache.value;
    return {
      configured: true,
      used: null,
      error: 'monitoring_unavailable',
      limit: parseInt(process.env.GEMMA_DAILY_BUDGET || '1500', 10),
    };
  }
}

module.exports = {
  configured,
  getDailyGenerativeLanguageRequests,
  getCachedDailyGenerativeLanguageRequests,
  publicQuotaView,
  gcpRequestCountFilter,
  loadServiceAccount,
  pacificStartOfDay,
};
