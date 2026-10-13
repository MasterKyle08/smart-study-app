const test = require('node:test');
const assert = require('node:assert/strict');

test('production HTTP startup, secure auth cookies and proxy addressing work with an isolated database', async () => {
  // Never load .env or connect to the real deployment database/providers.
  const saved = { ...process.env };
  let server;
  let closeDB;
  try {
    Object.assign(process.env, {
      NODE_ENV: 'production', TRUST_PROXY: '1',
      TURSO_DATABASE_URL: 'file::memory:',
      TURSO_AUTH_TOKEN: '', JWT_SECRET: 'isolated-oracle-smoke-test-secret',
      ADMIN_EMAIL: 'owner@example.test',
      GOOGLE_API_KEY: '', GOOGLE_FREE_API_KEY: '',
      GCP_SERVICE_ACCOUNT_JSON: '', GOOGLE_APPLICATION_CREDENTIALS: '',
      GCP_SERVICE_ACCOUNT_FILE: '', GCP_PROJECT_ID: '', GOOGLE_CLOUD_PROJECT: '',
    });
    const database = require('../models/db');
    closeDB = database.close;
    await database.init();
    const app = require('../app');
    assert.equal(app.get('trust proxy'), 1);
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.on('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    for (const route of ['/', '/dashboard', '/practice', '/premade', '/admin']) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), /text\/html/);
      await response.text();
    }
    const registration = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.42' },
      body: JSON.stringify({ email: 'member@example.test', password: 'test-password-only' }),
    });
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get('set-cookie');
    assert.match(cookie, /; Secure/i);
    assert.match(cookie, /; HttpOnly/i);
    assert.match(cookie, /; SameSite=Lax/i);
    const registered = await registration.json();
    assert.equal(registered.user.isAdmin, false);
    assert.equal(registered.token, undefined);
    const current = await fetch(`${base}/api/auth/me`, { headers: { cookie: cookie.split(';')[0] } });
    assert.equal(current.status, 200);
    assert.equal((await current.json()).user.email, 'member@example.test');
    const missing = await fetch(`${base}/api/does-not-exist`);
    assert.equal(missing.status, 404);
    await missing.json();
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (closeDB) await closeDB();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
