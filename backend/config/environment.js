const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

function configureRuntime({ env = process.env, projectDir = path.resolve(__dirname, '../..'), files = fs } = {}) {
  const production = env.NODE_ENV === 'production';
  const localFile = path.join(projectDir, '.env.local');
  const profile = production ? path.join(projectDir, '.env') : (files.existsSync(localFile) ? localFile : path.join(projectDir, '.env'));
  const values = files.existsSync(profile) ? dotenv.parse(files.readFileSync(profile, 'utf8')) : {};
  for (const [key, value] of Object.entries(values)) if (env[key] === undefined) env[key] = value;

  if (production) {
    env.LOCAL_DEVELOPMENT = '0';
    env.LOCAL_FREE_ONLY = '0';
    return { production: true, profile };
  }

  // Manual local runs deliberately use real free Gemma and the user's shared
  // Turso database. Isolate browser tokens and disable unrelated paid services.
  env.NODE_ENV = 'development';
  env.HOST = '127.0.0.1';
  env.PORT = files.existsSync(localFile) ? (values.PORT || '4173') : '4173';
  env.TRUST_PROXY = '0';
  env.LOCAL_DEVELOPMENT = '1';
  env.LOCAL_FREE_ONLY = '1';
  env.PREMIUM_USER_EMAILS = '';
  for (const key of Object.keys(env)) {
    if (/^(STRIPE_|PAYPAL_|LEMONSQUEEZY_|TWILIO_|SMTP_|RESEND_|ADSENSE_|GCP_)/.test(key)
      || ['GOOGLE_PREMIUM_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'EMAIL_FROM'].includes(key)) delete env[key];
  }
  const localDir = path.join(projectDir, '.local');
  files.mkdirSync(localDir, { recursive: true });
  const secretFile = path.join(localDir, 'session.secret');
  if (!files.existsSync(secretFile)) files.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  env.JWT_SECRET = files.readFileSync(secretFile, 'utf8').trim();
  if (!env.TURSO_DATABASE_URL) throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in private .env.local for local development.');
  return { production: false, profile };
}

module.exports = { configureRuntime };
