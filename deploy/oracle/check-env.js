// Run inside the production image before starting/replacing the live service.
// Prints variable names and instructions, never their secret values.
const errors = [];
for (const name of ['JWT_SECRET', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'SITE_ADDRESS']) {
  if (!process.env[name] || !process.env[name].trim()) errors.push(`${name} is missing.`);
}
if (process.env.TURSO_DATABASE_URL && !/^(libsql|https):\/\//.test(process.env.TURSO_DATABASE_URL)) {
  errors.push('This Oracle configuration needs your existing remote Turso URL (libsql:// or https://).');
}
if (process.env.SITE_ADDRESS && !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(process.env.SITE_ADDRESS)) {
  errors.push('SITE_ADDRESS must be a hostname without https://, a port, or a path.');
}
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_SERVICE_ACCOUNT_FILE) {
  errors.push('Clear GOOGLE_APPLICATION_CREDENTIALS and GCP_SERVICE_ACCOUNT_FILE; use GCP_SERVICE_ACCOUNT_JSON for optional monitoring.');
}
if (errors.length) {
  errors.forEach(message => console.error(`Configuration error: ${message}`));
  process.exit(1);
}
if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_FREE_API_KEY) {
  console.warn('GOOGLE_API_KEY or GOOGLE_FREE_API_KEY is needed for AI generation.');
}
const emailReady = process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const smsReady = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER;
if (!emailReady && !smsReady) {
  console.warn('Admin verification needs SMTP/Resend email or configured Twilio SMS with a verified user phone.');
}
if (!process.env.ADMIN_EMAIL) console.warn('Set ADMIN_EMAIL to your owner account email to enable owner admin access.');
async function preflightDatabase() {
  const { db, close, checkIdentityConflicts, checkReviewConflicts } = require('../../backend/models/db');
  try {
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
    const names = new Set(tables.rows.map(row => row.name));
    if (names.has('Users')) await checkIdentityConflicts();
    if (names.has('FlashcardReviews')) await checkReviewConflicts();
    console.log('Configuration and read-only database preflight passed.');
  } finally { await close(); }
}
preflightDatabase().catch(error => { console.error(`Database preflight failed: ${error.message}`); process.exitCode = 1; });
