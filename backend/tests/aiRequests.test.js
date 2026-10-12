const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGoogleRequester } = require('../services/googleRequest');

function response(status, data, retryAfter = null) {
  return { status, ok: status < 400, json: async () => data, headers: { get: () => retryAfter } };
}
const success = { candidates: [{ content: { parts: [{ text: 'ready' }] }, finishReason: 'STOP' }] };
const options = { apiKey: 'private-test-key', modelName: 'gemma-4-31b-it', fallbackModelName: 'gemma-4-26b-a4b-it' };

function harness(fetch, extra = {}) {
  let time = 0;
  const sleeps = [];
  const logs = [];
  return {
    sleeps, logs,
    advance: ms => { time += ms; },
    request: createGoogleRequester({ fetch, freeIntervalMs: 0, now: () => time, sleep: async ms => { sleeps.push(ms); time += ms; }, random: () => 0, log: item => logs.push(item), ...extra }),
  };
}

test('provider failure falls back to free Gemma 4, remembers cooldown and recovers primary', async () => {
  const models = [];
  const h = harness(async url => {
    models.push(url.split('/models/')[1].split(':')[0]);
    return models.length === 1 ? response(500, { error: { message: 'Internal error encountered.' } }) : response(200, success);
  });
  assert.equal((await h.request({}, options)).modelName, options.fallbackModelName);
  await h.request({}, options);
  h.advance(300001);
  await h.request({}, options);
  assert.deepEqual(models, [options.modelName, options.fallbackModelName, options.fallbackModelName, options.modelName]);
  assert.deepEqual(h.sleeps, [1000]);
});

test('authentication, invalid requests and daily/long quota waits fail without extra calls', async () => {
  for (const [status, details, retryAfter] of [
    [400, [], null], [403, [], null],
    [429, [{ violations: [{ quotaId: 'GenerateRequestsPerDay' }] }], null],
    [429, [], '60'],
  ]) {
    let calls = 0;
    const h = harness(async () => { calls += 1; return response(status, { error: { message: 'Request rejected', details } }, retryAfter); });
    await assert.rejects(h.request({}, options), error => error.googleStatus === status);
    assert.equal(calls, 1);
    assert.equal(h.sleeps.length, 0);
  }
});

test('short rate limits back off on the same model and do not change to fallback', async () => {
  const urls = [];
  const h = harness(async url => {
    urls.push(url);
    return urls.length === 1 ? response(429, { error: { message: 'Slow down', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '2s' }] } }) : response(200, success);
  });
  await h.request({}, options);
  assert.deepEqual(h.sleeps, [2000]);
  assert.equal(urls[0], urls[1]);
});

test('repeated outages have a bounded number of attempts', async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; return response(503, { error: { message: 'Unavailable' } }); });
  await assert.rejects(h.request({}, options), error => error.statusCode === 502);
  assert.equal(calls, 3);
  assert.deepEqual(h.sleeps, [1000, 2000]);
});

test('Retry-After dates are honored instead of resending immediately', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls += 1;
    return calls === 1 ? response(429, { error: { message: 'Slow down' } }, new Date(2000).toUTCString()) : response(200, success);
  });
  await h.request({}, options);
  assert.deepEqual(h.sleeps, [2000]);
});

test('slow primary request is aborted and replaced by free-model fallback', async () => {
  let calls = 0;
  const h = harness(async (_url, init) => {
    calls += 1;
    if (calls > 1) return response(200, success);
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  }, { primaryTimeoutMs: 10 });
  assert.equal((await h.request({}, options)).modelName, options.fallbackModelName);
  assert.equal(calls, 2);
});

test('free requests are paced and API keys are absent from URLs and telemetry', async () => {
  const calls = [];
  const h = harness(async (url, init) => { calls.push({ url, init }); return response(200, success); }, { freeIntervalMs: 4000 });
  await h.request({}, options);
  await h.request({}, options);
  assert.deepEqual(h.sleeps, [4000]);
  assert.equal(calls[0].init.headers['x-goog-api-key'], options.apiKey);
  assert.ok(!calls[0].url.includes(options.apiKey));
  assert.ok(!JSON.stringify(h.logs).includes(options.apiKey));
});

function loadService(filename, overrides, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services', filename), 'utf8'), {
    module, exports: module.exports,
    require: name => overrides[name] || require(name),
    process: { env: { GOOGLE_API_KEY: 'free-key', GOOGLE_PREMIUM_API_KEY: 'premium-key', ...env } },
    console: { log() {}, info() {}, warn() {}, error() {} },
  }, { filename });
  return module.exports;
}

test('free transport caps simultaneous provider calls at two', async () => {
  let active = 0;
  let maximum = 0;
  const finishes = [];
  const h = harness(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    return new Promise(resolve => finishes.push(() => { active -= 1; resolve(response(200, success)); }));
  });
  const pending = Array.from({ length: 4 }, () => h.request({}, options));
  await new Promise(setImmediate);
  assert.equal(finishes.length, 2);
  finishes.shift()();
  await new Promise(setImmediate);
  assert.equal(finishes.length, 2);
  finishes.shift()();
  await new Promise(setImmediate);
  while (finishes.length) finishes.shift()();
  await Promise.all(pending);
  assert.equal(maximum, 2);
});

test('a queued request expires without waiting for busy calls or reaching Google', async () => {
  const finishes = [];
  let calls = 0;
  const h = harness(async () => {
    calls += 1;
    if (calls > 2) return response(200, success);
    return new Promise(resolve => finishes.push(() => resolve(response(200, success))));
  });
  const busy = [h.request({}, options), h.request({}, options)];
  await new Promise(setImmediate);
  await assert.rejects(h.request({}, { ...options, timeoutMs: 10 }), error => error.statusCode === 504);
  assert.equal(calls, 2);
  while (finishes.length) finishes.shift()();
  await Promise.all(busy);
  await h.request({}, options);
  assert.equal(calls, 3);
});

test('free flashcards use one prompt-JSON call and preserve thinking-off configuration', async () => {
  const calls = [];
  const ai = loadService('ai.js', {
    './googleRequest': { createGoogleRequester: () => async (payload, requestOptions) => {
      calls.push({ payload, requestOptions });
      return { modelName: requestOptions.modelName, data: { candidates: [{ content: { parts: [{ thought: true, text: 'internal thought' }, { text: '[{"term":"API","definition":"Application programming interface"}]' }] } }] } };
    } },
    './usage': { recordRequest: async () => {} },
  });
  const cards = await ai.generateFlashcards('API means application programming interface.');
  assert.equal(cards[0].term, 'API');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.generationConfig.responseSchema, undefined);
  assert.equal(calls[0].payload.generationConfig.responseMimeType, undefined);
  assert.equal(calls[0].payload.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.equal(calls[0].requestOptions.fallbackModelName, options.fallbackModelName);
});

test('premium JSON authentication error is not followed by another format request', async () => {
  let calls = 0;
  const ai = loadService('ai.js', {
    './googleRequest': { createGoogleRequester: () => async () => { calls += 1; throw Object.assign(new Error('Forbidden'), { statusCode: 403, googleStatus: 403 }); } },
    './usage': { recordRequest: async () => {} },
  });
  await assert.rejects(ai.generateFlashcards('Study notes', { premium: true }), error => error.statusCode === 403);
  assert.equal(calls, 1);
});

test('all rate-limited study outputs preserve HTTP 429', async () => {
  const fail = async () => { throw Object.assign(new Error('Quota exhausted'), { statusCode: 429 }); };
  const file = loadService('file.js', {
    './ai': { generateSummary: fail, generateFlashcards: fail, generateQuizWithOptions: fail },
    '../models/Session': { create: async () => { throw new Error('Should not save failed output'); } },
  });
  await assert.rejects(file.processUploadedText({ extractedText: 'Study notes', outputFormats: ['all'] }), error => error.statusCode === 429);
});

test('study outputs overlap with two workers and save one complete session', async () => {
  const started = [];
  const resolve = {};
  let saved;
  const output = name => { started.push(name); return new Promise(done => { resolve[name] = done; }); };
  const file = loadService('file.js', {
    './ai': { generateSummary: () => output('summary'), generateFlashcards: () => output('flashcards'), generateQuizWithOptions: () => output('quiz') },
    '../models/Session': { create: async row => { saved = row; return { id: 42 }; } },
  });
  const pending = file.processUploadedText({ extractedText: 'Study notes', outputFormats: ['all'], originalFilename: 'notes.txt', originalContentType: 'text/plain', userId: 9 });
  assert.deepEqual(started, ['summary', 'flashcards']);
  resolve.summary('summary');
  await new Promise(setImmediate);
  assert.deepEqual(started, ['summary', 'flashcards', 'quiz']);
  resolve.flashcards([{ term: 'API', definition: 'Interface' }]);
  resolve.quiz([{ id: 'q1' }]);
  const result = await pending;
  assert.equal(result.sessionId, 42);
  assert.equal(saved.summary, 'summary');
  assert.equal(JSON.parse(saved.flashcards)[0].term, 'API');
  assert.equal(JSON.parse(saved.quiz)[0].id, 'q1');
});
