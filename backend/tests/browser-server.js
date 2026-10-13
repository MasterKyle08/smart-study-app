// Dedicated browser fixture server: no .env loading, cloud services or shared DB.
Object.assign(process.env, {
  NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4180',
  TURSO_DATABASE_URL: 'file::memory:', TURSO_AUTH_TOKEN: '',
  JWT_SECRET: 'browser-fixture-only-signing-secret', ADMIN_EMAIL: 'owner@local.test',
  LOCAL_DEVELOPMENT: '1', LOCAL_FREE_ONLY: '1',
});
for (const key of Object.keys(process.env)) {
  if (/^(GOOGLE_|GCP_|STRIPE_|PAYPAL_|LEMONSQUEEZY_|SMTP_|TWILIO_|RESEND_|ADSENSE_)/.test(key)) delete process.env[key];
}
const { init, close } = require('../models/db');
const app = require('../app');
let server;
init().then(() => {
  server = app.listen(4180, '127.0.0.1', () => console.log('Isolated browser test server: http://127.0.0.1:4180'));
}).catch(error => { console.error(error.message); process.exit(1); });
async function stop() {
  if (server) await new Promise(resolve => server.close(resolve));
  await close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
