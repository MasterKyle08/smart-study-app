const nodeFetch = require('node-fetch');
const { setTimeout: pause } = require('node:timers/promises');

function estimateInputTokens(payload) {
  // Conservative text estimate, reconciled with Google's promptTokenCount on
  // success. Image tokenization varies; never count base64 bytes as text.
  const parts = [...(payload.contents || []).flatMap(content => content.parts || []), ...(payload.systemInstruction?.parts || [])];
  const chars = parts.reduce((total, part) => total + String(part.text || '').length, 0);
  const images = parts.filter(part => part.inlineData || part.fileData).length;
  return Math.ceil((chars + JSON.stringify(payload.generationConfig?.responseSchema || {}).length) / 3) + 256 + images * 1500;
}

function quotaError(waitMs, { daily = false, inputTokens = false, limit } = {}) {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  const label = inputTokens ? `input-token limit${limit ? ` (${limit.toLocaleString()} tokens/minute)` : ''}` : 'rate limit';
  const message = daily
    ? 'Google\'s daily free AI quota is exhausted. Check AI Studio for the reset time.'
    : `Google's free AI ${label} was reached. Try again in about ${seconds} seconds. Local testing and the live site share the same Google project quota.`;
  return Object.assign(new Error(message), { statusCode: 429, retryDelayMs: waitMs, dailyQuota: daily });
}

function createGoogleRequester({
  fetch = nodeFetch,
  sleep = (ms, signal) => pause(ms, undefined, { signal }),
  now = Date.now,
  random = Math.random,
  log = record => console.info('[google-ai]', JSON.stringify(record)),
  freeIntervalMs = Math.max(0, Number(process.env.GOOGLE_FREE_REQUEST_INTERVAL_MS ?? 4000)),
  freeInputTokensPerMinute = Math.max(1, Number(process.env.GOOGLE_FREE_INPUT_TOKENS_PER_MINUTE || 14000)),
  primaryTimeoutMs = Math.max(1000, Number(process.env.GOOGLE_FREE_PRIMARY_TIMEOUT_MS || 25000)),
  cooldownMs = Math.max(1000, Number(process.env.GOOGLE_FREE_FALLBACK_COOLDOWN_MS || 300000)),
  retries = 2,
  maxQueued = 24,
  getSignal = () => undefined,
  beforeRequest = async () => null,
  afterResponse = async () => {},
  onProviderStart = () => {},
  onUnusedReservation = async () => {},
} = {}) {
  const unavailableUntil = new Map();
  const tokenWindows = new Map();
  const quotaPauses = new Map();
  let nextFreeStart = 0;
  const groups = { free: { active: 0, waiting: [], limit: 2 }, premium: { active: 0, waiting: [], limit: 4 } };
  function release(group) {
    if (group.waiting.length) {
      const ticket = group.waiting.shift();
      clearTimeout(ticket.timer);
      ticket.cleanup();
      ticket.resolve(() => release(group));
    } else group.active -= 1;
  }
  function acquire(deadline, premium, signal) {
    const group = premium ? groups.premium : groups.free;
    if (signal?.aborted) return Promise.reject(Object.assign(new Error('Request cancelled.'), { statusCode: 499 }));
    if (group.active < group.limit) { group.active += 1; return Promise.resolve(() => release(group)); }
    if (groups.free.waiting.length + groups.premium.waiting.length >= maxQueued) return Promise.reject(Object.assign(new Error('AI is busy. Try again shortly.'), { statusCode: 503 }));
    return new Promise((resolve, reject) => {
      const cancel = () => finish(Object.assign(new Error('Request cancelled.'), { statusCode: 499 }));
      const ticket = { resolve, cleanup: () => signal?.removeEventListener('abort', cancel) };
      function finish(error) {
        const index = group.waiting.indexOf(ticket);
        if (index === -1) return;
        group.waiting.splice(index, 1);
        clearTimeout(ticket.timer);
        ticket.cleanup();
        reject(error);
      }
      ticket.timer = setTimeout(() => {
        finish(Object.assign(new Error('AI queue took too long. Try again shortly.'), { statusCode: 504 }));
      }, Math.max(1, deadline - now()));
      group.waiting.push(ticket);
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }
  return async function request(payload, { apiKey, modelName, premium = false, timeoutMs = 90000, fallbackModelName, signal = getSignal() } = {}) {
    const deadline = now() + timeoutMs;
    let currentModel = modelName;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let unlock;
      let timer;
      let providerStarted;
      let reservation;
      let usageReservation;
      let dispatched = false;
      const started = now();
      try {
        unlock = await acquire(deadline, premium, signal);
        if (!premium) {
          const estimated = estimateInputTokens(payload);
          // Recheck all gates after every sleep: another request may discover a
          // quota cooldown while this one is already waiting to start.
          while (true) {
            if (fallbackModelName && (unavailableUntil.get(modelName) || 0) > now()) currentModel = fallbackModelName;
            const pause = quotaPauses.get(currentModel);
            if (pause?.daily && pause.until > now()) throw quotaError(pause.until - now(), pause);
            const window = (tokenWindows.get(currentModel) || []).filter(entry => entry.at + 60000 > now());
            tokenWindows.set(currentModel, window);
            const budget = pause?.budget || freeInputTokensPerMinute;
            let used = window.reduce((sum, entry) => sum + entry.tokens, 0);
            let tokenWait = 0;
            for (const entry of window) {
              if (used + estimated <= budget) break;
              tokenWait = entry.at + 60000 - now();
              used -= entry.tokens;
            }
            const quotaWait = Math.max(tokenWait, (pause?.until || 0) - now(), 0);
            const wait = Math.max(quotaWait, nextFreeStart - now(), 0);
            if (wait >= deadline - now()) {
              if (quotaWait) throw quotaError(quotaWait, { ...pause, inputTokens: tokenWait > 0 || pause?.inputTokens });
              throw Object.assign(new Error('AI queue took too long. Try again shortly.'), { statusCode: 504 });
            }
            if (signal?.aborted) throw Object.assign(new Error('Request cancelled.'), { statusCode: 499 });
            if (wait) { await sleep(wait, signal); continue; }
            // A single large estimated request is allowed through an empty
            // window. The estimate is a pacing aid, not Google's tokenizer.
            reservation = { at: now(), tokens: estimated };
            window.push(reservation);
            nextFreeStart = now() + freeIntervalMs;
            break;
          }
        }
        usageReservation = await beforeRequest(payload, { premium, modelName: currentModel });
        if (signal?.aborted) throw Object.assign(new Error('Request cancelled.'), { statusCode: 499 });
        const remaining = deadline - now();
        if (remaining <= 0) throw Object.assign(new Error('The AI took too long to respond.'), { statusCode: 504 });
        const controller = new AbortController();
        const limit = !premium && fallbackModelName && currentModel === modelName ? Math.min(remaining, primaryTimeoutMs) : remaining;
        timer = setTimeout(() => controller.abort(), limit);
        providerStarted = now();
        onProviderStart(usageReservation);
        dispatched = true;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(payload),
          signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        const inputTokens = Number(data.usageMetadata?.promptTokenCount || data.usage_metadata?.prompt_token_count || 0);
        if (reservation && inputTokens > 0) reservation.tokens = inputTokens;
        log({ model: currentModel, status: response.status, attempt: attempt + 1, elapsedMs: now() - started, queueMs: providerStarted - started, providerMs: now() - providerStarted, finishReason: data.candidates?.[0]?.finishReason, inputTokens: inputTokens || undefined });
        if (!response.ok) {
          const error = new Error(data.error?.message || `Google AI request failed (${response.status}).`);
          error.googleStatus = response.status;
          error.statusCode = response.status >= 500 ? 502 : response.status;
          const details = data.error?.details || [];
          const retryInfo = details.find(item => /RetryInfo$/.test(item['@type'] || ''));
          const retryHeader = response.headers?.get('retry-after');
          const headerSeconds = Number(retryHeader);
          const headerDelay = retryHeader ? (Number.isFinite(headerSeconds) ? headerSeconds * 1000 : Math.max(0, Date.parse(retryHeader) - now())) : 0;
          error.retryDelayMs = Math.ceil(Math.max(Number.isFinite(headerDelay) ? headerDelay : 0, (parseFloat(retryInfo?.retryDelay) || 0) * 1000));
          error.dailyQuota = /per.?day|daily/i.test(JSON.stringify(details) + ' ' + error.message);
          if (!premium && response.status === 429) {
            const violations = details.flatMap(item => item.violations || []);
            const tokenViolation = violations.find(item => /input_token/i.test(item.quotaMetric || item.quotaId || ''));
            const inputQuota = Boolean(tokenViolation) || /input_token/i.test(error.message);
            const limit = Number(tokenViolation?.quotaValue) || undefined;
            const oldPause = quotaPauses.get(currentModel);
            const wait = error.retryDelayMs || 60000;
            const pause = {
              until: Math.max(oldPause?.until || 0, now() + wait), daily: error.dailyQuota,
              inputTokens: inputQuota, limit,
              budget: limit ? Math.min(freeInputTokensPerMinute, Math.max(1, Math.floor(limit * 0.9))) : oldPause?.budget,
            };
            quotaPauses.set(currentModel, pause);
            const friendly = quotaError(wait, pause);
            friendly.googleStatus = 429;
            throw friendly;
          }
          throw error;
        }
        // Keep the conservative reservation if reconciliation is temporarily
        // unavailable; never repeat a successful provider call for a DB error.
        try { await afterResponse(usageReservation, data); } catch (_error) { /* keep conservative reservation */ }
        return { data, modelName: currentModel };
      } catch (error) {
        if (signal?.aborted) throw Object.assign(new Error('Request cancelled.'), { statusCode: 499 });
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
        const transient = providerUnavailable || networkFailure || error.googleStatus === 408 || (error.googleStatus === 429 && !error.dailyQuota && (error.retryDelayMs || 0) <= (premium ? 10000 : 60000));
        const delay = Math.max(error.retryDelayMs || 0, 1000 * (2 ** attempt) + Math.floor(random() * 250));
        if (!transient || attempt >= retries || now() + delay >= deadline) throw error;
        if (timer) { clearTimeout(timer); timer = null; }
        if (unlock) { unlock(); unlock = null; }
        await sleep(delay, signal).catch(error => {
          if (signal?.aborted) throw Object.assign(new Error('Request cancelled.'), { statusCode: 499 });
          throw error;
        });
      } finally {
        if (!dispatched) {
          try { await onUnusedReservation(usageReservation); } catch (_error) { /* fail closed if refund is unavailable */ }
          if (reservation) {
            const window = tokenWindows.get(currentModel) || [];
            const index = window.indexOf(reservation);
            if (index !== -1) window.splice(index, 1);
          }
        }
        if (timer) clearTimeout(timer);
        if (unlock) unlock();
      }
    }
  };
}

module.exports = { createGoogleRequester, estimateInputTokens };
