/**
 * @file backend/models/db.js
 * @description Turso database setup and initialization.
 * Creates tables if they don't exist using @libsql/client.
 */

const { createClient } = require('@libsql/client');

// Environment variables for Turso connection
const tursoDbUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoDbUrl) {
  console.error('FATAL ERROR: TURSO_DATABASE_URL is not defined. Please set it in your .env file.');
  process.exit(1);
}
if (!tursoAuthToken) {
  console.warn('WARNING: TURSO_AUTH_TOKEN is not defined. Database connection might fail if required.');
}

/**
 * Turso database client instance.
 * @type {import('@libsql/client').Client}
 */
const db = createClient({
  url: tursoDbUrl,
  authToken: tursoAuthToken,
});

const createUserTableSQL = `CREATE TABLE IF NOT EXISTS Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`;

const createSessionsTableSQL = `CREATE TABLE IF NOT EXISTS Sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  original_filename TEXT,
  original_content_type TEXT,
  extracted_text TEXT,
  summary TEXT,
  flashcards TEXT, 
  quiz TEXT, 
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);`;

const createSessionUpdateTriggerSQL = `CREATE TRIGGER IF NOT EXISTS update_sessions_updated_at
AFTER UPDATE ON Sessions
FOR EACH ROW
BEGIN
  UPDATE Sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;`;

const createPremadeQuizzesTableSQL = `CREATE TABLE IF NOT EXISTS PremadeQuizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  topic TEXT,
  tags TEXT,
  source_text TEXT,
  quiz_json TEXT NOT NULL,
  quiz_options TEXT,
  is_public INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
);`;

const createPremadeQuizUpdateTriggerSQL = `CREATE TRIGGER IF NOT EXISTS update_premade_quizzes_updated_at
AFTER UPDATE ON PremadeQuizzes
FOR EACH ROW
BEGIN
  UPDATE PremadeQuizzes SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;`;

/**
 * Initializes the database by creating tables if they don't exist.
 * Executes DDL statements sequentially.
 * @returns {Promise<void>} A promise that resolves when tables are created.
 */
async function addColumnIfMissing(sql, label) {
  try {
    await db.execute(sql);
    console.log(`${label} column added.`);
  } catch (alterError) {
    const message = (alterError.message || '').toLowerCase();
    if (message.includes('duplicate column') || message.includes('already exists')) {
      console.log(`${label} column already present.`);
    } else {
      throw alterError;
    }
  }
}

async function init() {
  console.log('Attempting to initialize Turso database schema...');
  try {
    // Enable foreign key support. This is often a session-specific pragma.
    await db.execute('PRAGMA foreign_keys = ON;');
    console.log("Foreign key support enabled for Turso DB session.");

    // Execute DDL statements one by one.
    console.log('Executing: Create Users Table IF NOT EXISTS');
    await db.execute(createUserTableSQL);
    console.log('Users table checked/created.');

    console.log('Executing: Create Sessions Table IF NOT EXISTS');
    await db.execute(createSessionsTableSQL);
    console.log('Sessions table checked/created.');

    console.log('Executing: Create Session Update Trigger IF NOT EXISTS');
    await db.execute(createSessionUpdateTriggerSQL);
    console.log('Session update trigger checked/created.');

    console.log('Executing: Create PremadeQuizzes Table IF NOT EXISTS');
    await db.execute(createPremadeQuizzesTableSQL);
    console.log('PremadeQuizzes table checked/created.');

    console.log('Executing: Create PremadeQuizzes Update Trigger IF NOT EXISTS');
    await db.execute(createPremadeQuizUpdateTriggerSQL);
    console.log('PremadeQuizzes update trigger checked/created.');

    await addColumnIfMissing("ALTER TABLE Users ADD COLUMN plan TEXT DEFAULT 'free'", 'Users.plan');
    await addColumnIfMissing("ALTER TABLE Users ADD COLUMN stripe_customer_id TEXT", 'Users.stripe_customer_id');
    await addColumnIfMissing("ALTER TABLE Users ADD COLUMN billing_provider TEXT", 'Users.billing_provider');
    await addColumnIfMissing("ALTER TABLE Users ADD COLUMN role TEXT DEFAULT 'user'", 'Users.role');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN is_banned INTEGER DEFAULT 0', 'Users.is_banned');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN banned_at TEXT', 'Users.banned_at');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN ban_reason TEXT', 'Users.ban_reason');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN phone TEXT', 'Users.phone');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN phone_verified INTEGER DEFAULT 0', 'Users.phone_verified');

    await db.execute(`CREATE TABLE IF NOT EXISTS AdminOtps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      destination TEXT,
      channel TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      consumed_at TEXT,
      ip TEXT,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    );`);
    console.log('AdminOtps table checked/created.');

    await db.execute(`CREATE TABLE IF NOT EXISTS AdminAuditLog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      target_email TEXT,
      details TEXT,
      ip TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`);
    console.log('AdminAuditLog table checked/created.');

    try {
      const { ownerEmails } = require('../utils/adminRules');
      const emails = ownerEmails();
      for (const email of emails) {
        await db.execute({
          sql: "UPDATE Users SET role = 'admin' WHERE LOWER(email) = ?",
          args: [email],
        });
      }
      if (emails.length) console.log(`Owner admin role seeded for ${emails.length} email(s).`);
    } catch (seedError) {
      console.warn('Owner admin seed skipped:', seedError.message);
    }

    await db.execute(`CREATE TABLE IF NOT EXISTS AiUsageDaily (
      usage_date TEXT NOT NULL,
      user_key TEXT NOT NULL,
      gemma_requests INTEGER DEFAULT 0,
      premium_requests INTEGER DEFAULT 0,
      jobs INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      ad_rewards INTEGER DEFAULT 0,
      last_ad_at TEXT,
      bonus_jobs INTEGER DEFAULT 0,
      PRIMARY KEY (usage_date, user_key)
    );`);
    console.log('AiUsageDaily table checked/created.');
    await addColumnIfMissing('ALTER TABLE AiUsageDaily ADD COLUMN bonus_jobs INTEGER DEFAULT 0', 'AiUsageDaily.bonus_jobs');

    await db.execute(`CREATE TABLE IF NOT EXISTS FlashcardReviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id INTEGER,
      card_key TEXT NOT NULL,
      term TEXT,
      repetitions INTEGER DEFAULT 0,
      interval_days INTEGER DEFAULT 0,
      ease_factor REAL DEFAULT 2.5,
      due_at TEXT,
      last_quality INTEGER,
      last_reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    );`);
    console.log('FlashcardReviews table checked/created.');
    
    console.log('Database schema initialization statements executed with Turso.');
  } catch (error) {
    console.error('Error during Turso database schema initialization:', error.message);
    if (error.cause) {
        console.error('Cause:', error.cause);
    }
    // Check for common "already exists" messages which are not critical errors for IF NOT EXISTS
    if (error.message && (error.message.toLowerCase().includes('table users already exists') || 
                           error.message.toLowerCase().includes('table sessions already exists') ||
                           error.message.toLowerCase().includes('trigger update_sessions_updated_at already exists'))) {
        console.warn('One or more schema elements already existed, which is fine with "IF NOT EXISTS".');
    } else {
        // For other errors, including the "migration jobs" one if it persists, re-throw.
        throw error; 
    }
  }
}

/**
 * Closes the database connection.
 */
async function close() {
  try {
    db.close(); // client.close() is synchronous for the http client
    console.log('Turso database connection closed.');
  } catch (error) {
    console.error('Error closing Turso database connection:', error);
  }
}

// Handle command line argument for explicit DB initialization
if (require.main === module && process.argv.includes('init')) {
  console.log('Manual Turso DB initialization requested...');
  init()
    .then(() => {
      console.log('Manual Turso DB initialization complete.');
      return close(); // close() is synchronous
    })
    .catch(err => {
      console.error('Manual Turso DB initialization failed:', err);
      close(); // close() is synchronous
      process.exit(1);
    });
}

module.exports = {
  db,
  init,
  close,
};
