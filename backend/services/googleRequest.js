const nodeFetch = require('node-fetch');

function createGoogleRequester({
  fetch = nodeFetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now,
  random = Math.random,
  log = record => console.info('[google-ai]', JSON.stringify(record)),
  freeIntervalMs = Math.max(0, Number(process.env.GOOGLE_FREE_REQUEST_INTERVAL_MS ?? 4000)),
  primaryTimeoutMs = Math.max(1000, Number(process.env.GOOGLE_FREE_PRIMARY_TIMEOUT_MS || 25000)),
  cooldownMs = Math.max(1000, Number(process.env.GOOGLE_FREE_FALLBACK_COOLDOWN_MS || 300000)),
  retries = 2,
} = {}) {
  const unavailableUntil = new Map();
  let nextFreeStart = 0;
  let active = 0;
  const waiting = [];
  function release() {
    if (waiting.length) {
      const ticket = waiting.shift();
      clearTimeout(ticket.timer);
      ticket.resolve(release);
    } else active -= 1;
  }
  function acquire(deadline) {
    if (active < 2) { active += 1; return Promise.resolve(release); }
    return new Promise((resolve, reject) => {
      const ticket = { resolve };
      ticket.timer = setTimeout(() => {
        const index = waiting.indexOf(ticket);
        if (index !== -1) waiting.splice(index, 1);
        reject(Object.assign(new Error('AI queue took too long. Try again shortly.'), { statusCode: 504 }));
      }, Math.max(1, deadline - now()));
      waiting.push(ticket);
    });
  }
  return async function request(payload, { apiKey, modelName, premium = false, timeoutMs = 90000, fallbackModelName } = {}) {
    const deadline = now() + timeoutMs;
    let currentModel = modelName;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let unlock;
      let timer;
      let providerStarted;
      const started = now();
      try {
        if (!premium) {
          unlock = await acquire(deadline);
          const wait = Math.max(0, nextFreeStart - now());
          if (wait >= deadline - now()) throw Object.assign(new Error('AI queue took too long. Try again shortly.'), { statusCode: 504 });
          nextFreeStart = Math.max(now(), nextFreeStart) + freeIntervalMs;
          if (wait) await sleep(wait);
          if (fallbackModelName && (unavailableUntil.get(modelName) || 0) > now()) currentModel = fallbackModelName;
        }
        const remaining = deadline - now();
        if (remaining <= 0) throw Object.assign(new Error('The AI took too long to respond.'), { statusCode: 504 });
        const controller = new AbortController();
        const limit = !premium && fallbackModelName && currentModel === modelName ? Math.min(remaining, primaryTimeoutMs) : remaining;
        timer = setTimeout(() => controller.abort(), limit);
        providerStarted = now();
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        log({ model: currentModel, status: response.status, attempt: attempt + 1, elapsedMs: now() - started, queueMs: providerStarted - started, providerMs: now() - providerStarted, finishReason: data.candidates?.[0]?.finishReason });
        if (!response.ok) {
          const error = new Error(data.error?.message || `Google AI request failed (${response.status}).`);
          error.googleStatus = response.status;
          error.statusCode = response.status >= 500 ? 502 : response.status;
          const details = data.error?.details || [];
          const retryInfo = details.find(item => /RetryInfo$/.test(item['@type'] || ''));
          const retryHeader = response.headers?.get('retry-after');
          const headerSeconds = Number(retryHeader);
          const headerDelay = retryHeader ? (Number.isFinite(headerSeconds) ? headerSeconds * 1000 : Math.max(0, Date.parse(retryHeader) - now())) : 0;
          error.retryDelayMs = Math.max(Number.isFinite(headerDelay) ? headerDelay : 0, (parseFloat(retryInfo?.retryDelay) || 0) * 1000);
          error.dailyQuota = /per.?day|daily/i.test(JSON.stringify(details) + ' ' + error.message);
          throw error;
        }
        return { data, modelName: currentModel };
      } catch (error) {
        if (error.name === 'AbortError') {
          error = Object.assign(new Error('The AI took too long to respond. Try a shorter document or fewer questions.'), { statusCode: 504, timedOut: true });
          log({ model: currentModel, status: 'timeout', attempt: attempt + 1, elapsedMs: now() - started, queueMs: providerStarted - started, providerMs: now() - providerStarted });
        }
        const providerUnavailable = error.timedOut || error.googleStatus >= 500;
        if (!premium && fallbackModelName && currentModel === modelName && providerUnavailable) {
          unavailableUntil.set(modelName, now() + cooldownMs);
          currentModel = fallbackModelName;
        }
        const networkFailure = error.name === 'FetchError' && /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED/.test(error.code || '');
        const transient = providerUnavailable || networkFailure || error.googleStatus === 408 || (error.googleStatus === 429 && !error.dailyQuota && (error.retryDelayMs || 0) <= 10000);
        const delay = Math.max(error.retryDelayMs || 0, 1000 * (2 ** attempt) + Math.floor(random() * 250));
        if (!transient || attempt >= retries || now() + delay >= deadline) throw error;
        if (timer) { clearTimeout(timer); timer = null; }
        if (unlock) { unlock(); unlock = null; }
        await sleep(delay);
      } finally {
        if (timer) clearTimeout(timer);
        if (unlock) unlock();
      }
    }
  };
}

module.exports = { createGoogleRequester };
