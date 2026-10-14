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
    [429, [], '120'],
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
    './ai': { generateStudyMaterials: fail, generateSummary: fail, generateFlashcards: fail, generateQuizWithOptions: fail },
    '../models/Session': { create: async () => { throw new Error('Should not save failed output'); } },
  });
  await assert.rejects(file.processUploadedText({ extractedText: 'Study notes', outputFormats: ['all'] }), error => error.statusCode === 429);
});

test('premium study outputs overlap with two workers and save one complete session', async () => {
  const started = [];
  const resolve = {};
  let saved;
  const output = name => { started.push(name); return new Promise(done => { resolve[name] = done; }); };
  const file = loadService('file.js', {
    './ai': { generateSummary: () => output('summary'), generateFlashcards: () => output('flashcards'), generateQuizWithOptions: () => output('quiz') },
    '../models/Session': { create: async row => { saved = row; return { id: 42 }; } },
  });
  const pending = file.processUploadedText({ extractedText: 'Study notes', outputFormats: ['all'], originalFilename: 'notes.txt', originalContentType: 'text/plain', userId: 9, premium: true });
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

test('free requests pace input tokens over a minute and reconcile Google usage', async () => {
  const h = harness(async () => response(200, { ...success, usageMetadata: { promptTokenCount: 4932, candidatesTokenCount: 100000 } }));
  // Each estimate is about 5,250 tokens. Two actual inputs fit, three do not.
  const payload = { contents: [{ parts: [{ text: 'a'.repeat(15000) }] }] };
  await h.request(payload, options);
  await h.request(payload, options);
  await h.request(payload, options);
  assert.deepEqual(h.sleeps, [60000]);
  assert.equal(h.logs[2].queueMs, 60000);
  assert.equal(h.logs[0].inputTokens, 4932);
});

test('input-token pacing counts attempted calls and respects the total deadline', async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; return response(500, { error: { message: 'Unavailable' } }); }, { freeInputTokensPerMinute: 700 });
  const payload = { contents: [{ parts: [{ text: 'a'.repeat(450) }] }] };
  await assert.rejects(h.request(payload, { ...options, fallbackModelName: undefined, timeoutMs: 5000 }), error => error.statusCode === 429 && /seconds/.test(error.message));
  assert.equal(calls, 1);
  assert.deepEqual(h.sleeps, [1000]);
});

test('the reported minute quota waits for RetryInfo then retries the same free model', async () => {
  const urls = [];
  const h = harness(async url => {
    urls.push(url);
    return urls.length === 1 ? response(429, { error: {
      message: 'Quota exceeded for input_token_count',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count', quotaValue: '16000' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '42.624227322s' },
      ],
    } }) : response(200, success);
  });
  await h.request({}, options);
  assert.deepEqual(h.sleeps, [42625]);
  assert.equal(urls[0], urls[1]);
});

test('a quota discovered during pacing blocks another queued request', async () => {
  let time = 0;
  const sleepers = [];
  const starts = [];
  const request = createGoogleRequester({
    now: () => time, freeIntervalMs: 4000, retries: 0, log: () => {},
    sleep: ms => new Promise(resolve => sleepers.push({ ms, resolve })),
    fetch: async () => {
      starts.push(time);
      return starts.length === 1 ? response(429, { error: { message: 'Quota exceeded' } }, '43') : response(200, success);
    },
  });
  const first = assert.rejects(request({}, options), error => error.statusCode === 429 && /43 seconds/.test(error.message));
  const second = request({}, options);
  await new Promise(setImmediate);
  assert.equal(starts.length, 1);
  time = 4000;
  sleepers.shift().resolve();
  await new Promise(setImmediate);
  assert.equal(starts.length, 1);
  assert.equal(sleepers[0].ms, 39000);
  time = 43000;
  sleepers.shift().resolve();
  await Promise.all([first, second]);
  assert.deepEqual(starts, [0, 43000]);
});

test('free bundled outputs send the source once and preserve summary and quiz preferences', async () => {
  const calls = [];
  const ai = loadService('ai.js', {
    './googleRequest': { createGoogleRequester: () => async (payload, requestOptions) => {
      calls.push({ payload, requestOptions });
      return { modelName: requestOptions.modelName, data: { candidates: [{ content: { parts: [{ text: JSON.stringify({
        summary: 'A concise summary.', flashcards: [{ term: 'API', definition: 'An interface.' }],
        quiz: [{ questionText: 'What is an API?', questionType: 'short_answer', correctAnswer: 'An interface.' }],
      }) }] } }] } };
    } },
    './usage': { recordRequest: async () => {} },
  });
  const source = 'Unique source marker: API means application programming interface.';
  const result = await ai.generateStudyMaterials(source, {
    wantsSummary: true, wantsFlashcards: true, wantsQuiz: true,
    summaryLengthPreference: 'long', summaryStylePreference: 'bullets', summaryKeywords: ['interfaces'],
    summaryAudiencePurpose: 'a beginner', summaryNegativeKeywords: ['trivia'],
    quizOptions: { numQuestions: 3, questionTypes: ['short_answer'], difficulty: 'hard' },
  });
  assert.equal(calls.length, 1);
  const prompt = calls[0].payload.contents[0].parts[0].text;
  assert.equal(prompt.split(source).length - 1, 1);
  for (const text of ['250-350', 'bullet points', 'interfaces', 'a beginner', 'trivia', 'exactly 3', 'hard', 'short_answer']) assert.ok(prompt.includes(text), text);
  assert.equal(result.summary, 'A concise summary.');
  assert.equal(result.flashcards.length, 1);
  assert.equal(result.quiz[0].questionType, 'short_answer');
  assert.ok(result.warnings[0].includes('1 of 3'));
  assert.equal(calls[0].requestOptions.premium, false);
  assert.equal(calls[0].payload.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
});

test('free bundles retain usable sections without extra regeneration calls', async () => {
  let calls = 0;
  const ai = loadService('ai.js', {
    './googleRequest': { createGoogleRequester: () => async (_payload, requestOptions) => {
      calls += 1;
      return { modelName: requestOptions.modelName, data: { candidates: [{ content: { parts: [{ text: '{"summary":"Useful summary","flashcards":[],"quiz":[]}' }] } }] } };
    } },
    './usage': { recordRequest: async () => {} },
  });
  const result = await ai.generateStudyMaterials('Source', { wantsSummary: true, wantsFlashcards: true, wantsQuiz: true });
  assert.equal(calls, 1);
  assert.equal(result.summary, 'Useful summary');
  assert.equal(result.warnings.length, 2);
  assert.equal(result.quiz, undefined);
});

test('free file processing bundles selected outputs and saves the normalized session once', async () => {
  const calls = [];
  let saved;
  const file = loadService('file.js', {
    './ai': { generateStudyMaterials: async (...args) => {
      calls.push(args);
      return { summary: 'Summary', quiz: [{ id: 'q1' }], warnings: ['Flashcards: incomplete'] };
    } },
    '../models/Session': { create: async row => { saved = row; return { id: 42 }; } },
  });
  const result = await file.processUploadedText({ extractedText: 'Notes', outputFormats: ['all'], userId: 9, quizOptions: { numQuestions: 3 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].wantsQuiz, true);
  assert.equal(calls[0][1].quizOptions.numQuestions, 3);
  assert.equal(result.sessionId, 42);
  assert.equal(saved.flashcards, null);
  assert.equal(JSON.parse(saved.quiz)[0].id, 'q1');
  assert.ok(result.warnings.includes('Flashcards: incomplete'));
});

test('queued requests cancel promptly without contacting Google or retaining their slot', async () => {
  const finishes = [];
  let calls = 0;
  const h = harness(async () => {
    calls++;
    if (calls > 2) return response(200, success);
    return new Promise(resolve => finishes.push(() => resolve(response(200, success))));
  });
  const busy = [h.request({}, options), h.request({}, options)];
  await new Promise(setImmediate);
  const controller = new AbortController();
  const queued = h.request({}, { ...options, signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, error => error.statusCode === 499);
  assert.equal(calls, 2);
  while (finishes.length) finishes.shift()();
  await Promise.all(busy);
  await h.request({}, options);
  assert.equal(calls, 3);
});

test('the provider queue rejects overload and bounds Premium concurrency', async () => {
  const finishes = [];
  const h = harness(async () => new Promise(resolve => finishes.push(() => resolve(response(200, success)))), { maxQueued: 1 });
  const premium = { ...options, premium: true };
  const pending = Array.from({ length: 5 }, () => h.request({}, premium));
  await new Promise(setImmediate);
  assert.equal(finishes.length, 4);
  await assert.rejects(h.request({}, premium), error => error.statusCode === 503);
  finishes.shift()();
  await new Promise(setImmediate);
  while (finishes.length) finishes.shift()();
  await Promise.all(pending);
});

test('disconnecting during a provider request does not retry or switch models', async () => {
  let calls = 0;
  const controller = new AbortController();
  const h = harness(async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }))));
  });
  const pending = h.request({}, { ...options, signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort();
  await assert.rejects(pending, error => error.statusCode === 499);
  assert.equal(calls, 1);
});

test('cancellation after admission but before dispatch refunds the reservation without contacting Google', async () => {
  const controller = new AbortController();
  let calls = 0, refunded;
  const h = harness(async () => { calls++; return response(200, success); }, {
    beforeRequest: async () => { controller.abort(); return { fixtureReservation: 1 }; },
    onUnusedReservation: reservation => { refunded = reservation; },
  });
  await assert.rejects(h.request({}, { ...options, signal: controller.signal }), error => error.statusCode === 499);
  assert.equal(calls, 0);
  assert.deepEqual(refunded, { fixtureReservation: 1 });
});

test('Gemini 2.5 Premium uses thinkingBudget zero for text and structured output',async()=>{
 const payloads=[];const ai=loadService('ai.js',{
  './googleRequest':{createGoogleRequester:()=>async(payload,options)=>{payloads.push(payload);return {modelName:options.modelName,data:{candidates:[{content:{parts:[{text:payload.generationConfig.responseMimeType?'[{"term":"API","definition":"Application programming interface"}]':'Summary'}]},finishReason:'STOP'}]}}}},
  './usage':{recordRequest:async()=>{}},
 },{GOOGLE_PREMIUM_MODEL_NAME:'gemini-2.5-flash-lite'});
 await ai.generateSummary('Study source','short','plain','','','',{premium:true});
 await ai.generateFlashcards('Study source',{premium:true});
 assert.equal(payloads.length,2);for(const payload of payloads){assert.equal(payload.generationConfig.thinkingConfig.thinkingBudget,0);assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel,undefined);}
});

test('malformed grading output fails without assigning an incorrect score',async()=>{
 const ai=loadService('ai.js',{
  './googleRequest':{createGoogleRequester:()=>async(_payload,options)=>({modelName:options.modelName,data:{candidates:[{content:{parts:[{text:'{"feedback":"Missing score"}'}]}}]}})},
  './usage':{recordRequest:async()=>{}},'./aiTelemetry':{record:()=>{}},
 });
 await assert.rejects(ai.getFlashcardInteractionResponse({term:'Energy',definition:'Answer'},'submit_answer','Answer'),error=>error.statusCode===502);
 await assert.rejects(ai.getQuizAnswerFeedback({questionType:'short_answer',questionText:'Explain',correctAnswer:'Answer'},'Answer'),error=>error.statusCode===502);
});

test('network failures are recorded separately without prompt content',async()=>{
 const h=harness(async()=>{throw Object.assign(new Error('socket failed'),{name:'FetchError',code:'ECONNRESET'});},{retries:0});
 await assert.rejects(h.request({contents:[{parts:[{text:'Private prompt'}]}]},options));assert.equal(h.logs[0].outcome,'network-error');assert.ok(!JSON.stringify(h.logs).includes('Private prompt'));
});
