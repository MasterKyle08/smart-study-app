const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { configureRuntime } = require('../config/environment');

function fixture(profiles = {}) {
  const projectDir = path.resolve(__dirname, '../../.local/environment-fixture');
  const stored = new Map(Object.entries(profiles).map(([name, text]) => [path.join(projectDir, name), text]));
  return { projectDir, stored, files: {
    existsSync: file => stored.has(file),
    readFileSync: file => stored.get(file),
    mkdirSync() {},
    writeFileSync: (file, text) => stored.set(file, text),
  } };
}

test('local profile retains real free AI and Turso while isolating tokens and disabling production integrations', () => {
  const f = fixture({ '.env.local': 'TURSO_DATABASE_URL=libsql://shared.example\nTURSO_AUTH_TOKEN=test-token\nGOOGLE_API_KEY=free-test-key\nJWT_SECRET=production-token\nSMTP_PASS=test-mail\nSTRIPE_SECRET_KEY=test-pay\nGOOGLE_PREMIUM_API_KEY=paid-key\n' });
  const env = { SMTP_HOST: 'mail.example', TWILIO_AUTH_TOKEN: 'test-sms', GCP_SERVICE_ACCOUNT_JSON: '{}', JWT_SECRET: 'inherited-production-secret' };
  const result = configureRuntime({ ...f, env });
  assert.equal(result.production, false);
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.PORT, '4173');
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.GOOGLE_API_KEY, 'free-test-key');
  assert.equal(env.TURSO_AUTH_TOKEN, 'test-token');
  assert.notEqual(env.JWT_SECRET, 'production-token');
  assert.notEqual(env.JWT_SECRET, 'inherited-production-secret');
  assert.equal(env.JWT_SECRET.length, 64);
  for (const key of ['SMTP_HOST', 'SMTP_PASS', 'STRIPE_SECRET_KEY', 'TWILIO_AUTH_TOKEN', 'GCP_SERVICE_ACCOUNT_JSON', 'GOOGLE_PREMIUM_API_KEY']) assert.equal(env[key], undefined);
  assert.equal(env.LOCAL_FREE_ONLY, '1');
  const next = {};
  configureRuntime({ ...f, env: next });
  assert.equal(next.JWT_SECRET, env.JWT_SECRET);
});

test('production uses server environment without loading local credentials or local restrictions', () => {
  const f = fixture({ '.env': 'GOOGLE_API_KEY=server-key\nSMTP_PASS=server-mail\n', '.env.local': 'GOOGLE_API_KEY=local-key\n' });
  const env = { NODE_ENV: 'production', JWT_SECRET: 'real-server-secret', HOST: '127.0.0.1', PORT: '3000' };
  configureRuntime({ ...f, env });
  assert.equal(env.GOOGLE_API_KEY, 'server-key');
  assert.equal(env.SMTP_PASS, 'server-mail');
  assert.equal(env.JWT_SECRET, 'real-server-secret');
  assert.equal(env.PORT, '3000');
  assert.equal(env.LOCAL_DEVELOPMENT, '0');
  assert.equal(env.LOCAL_FREE_ONLY, '0');
  assert.equal(f.stored.size, 2);
});

test('local fallback to an existing .env still generates an independent login secret', () => {
  const f = fixture({ '.env': 'NODE_ENV=production\nPORT=3000\nTURSO_DATABASE_URL=libsql://shared.example\nGOOGLE_API_KEY=real-free-key\nJWT_SECRET=production-secret\n' });
  const env = {};
  configureRuntime({ ...f, env });
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.PORT, '4173');
  assert.equal(env.GOOGLE_API_KEY, 'real-free-key');
  assert.notEqual(env.JWT_SECRET, 'production-secret');
});

test('local server startup performs only readiness reads; production retains migrations and cleanup', async () => {
  for (const production of [false, true]) {
    const calls = { init: 0, cleanup: 0, sql: [], listen: 0 };
    const dependencies = {
      './backend/config/environment': { configureRuntime: () => ({ production }) },
      './backend/app': { listen: (_port, _host, ready) => { calls.listen += 1; ready(); } },
      './backend/models/db': { init: async () => { calls.init += 1; }, close: async () => {}, db: { execute: async sql => { calls.sql.push(sql); } } },
      './backend/models/Session': { deleteAnonymousOlderThan: async () => { calls.cleanup += 1; return 0; } },
    };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8'), {
      require: name => dependencies[name],
      process: { env: { NODE_ENV: production ? 'production' : 'development', HOST: '127.0.0.1', PORT: '4173', ADMIN_EMAIL: 'owner@local.test' }, on() {}, exit: code => { throw new Error(`Unexpected startup exit ${code}`); } },
      console: { log() {}, warn() {}, error() {} },
    });
    await new Promise(setImmediate);
    assert.equal(calls.listen, 1);
    assert.equal(calls.init, production ? 1 : 0);
    assert.equal(calls.cleanup, production ? 1 : 0);
    if (!production) assert.deepEqual(calls.sql, ['PRAGMA foreign_keys = ON;', 'SELECT id FROM Users LIMIT 0']);
  }
});
