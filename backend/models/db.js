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
    return true;
  } catch (alterError) {
    const message = (alterError.message || '').toLowerCase();
    if (message.includes('duplicate column') || message.includes('already exists')) {
      console.log(`${label} column already present.`);
      return false;
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
    await addColumnIfMissing('ALTER TABLE Sessions ADD COLUMN quiz_options TEXT', 'Sessions.quiz_options');
    for (const [name, type] of [['folder', "TEXT DEFAULT ''"], ['tags', "TEXT DEFAULT '[]'"], ['citations', 'TEXT']]) await addColumnIfMissing(`ALTER TABLE Sessions ADD COLUMN ${name} ${type}`, `Sessions.${name}`);

    console.log('Executing: Create Session Update Trigger IF NOT EXISTS');
    await db.execute(createSessionUpdateTriggerSQL);
    console.log('Session update trigger checked/created.');

    console.log('Executing: Create PremadeQuizzes Table IF NOT EXISTS');
    await db.execute(createPremadeQuizzesTableSQL);
    console.log('PremadeQuizzes table checked/created.');
    await addColumnIfMissing("ALTER TABLE PremadeQuizzes ADD COLUMN folder TEXT DEFAULT ''", 'PremadeQuizzes.folder');

    console.log('Executing: Create PremadeQuizzes Update Trigger IF NOT EXISTS');
    await db.execute(createPremadeQuizUpdateTriggerSQL);
    console.log('PremadeQuizzes update trigger checked/created.');

    await addColumnIfMissing("ALTER TABLE Users ADD COLUMN plan TEXT DEFAULT 'free'", 'Users.plan');
    await addColumnIfMissing("ALTER TABLE Users ADD COLUMN stripe_customer_id TEXT", 'Users.stripe_customer_id');
    await addColumnIfMissing("ALTER TABLE Users ADD COLUMN billing_provider TEXT", 'Users.billing_provider');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN premium_until INTEGER', 'Users.premium_until');
    await addColumnIfMissing("ALTER TABLE Users ADD COLUMN role TEXT DEFAULT 'user'", 'Users.role');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN is_owner INTEGER DEFAULT 0', 'Users.is_owner');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN is_banned INTEGER DEFAULT 0', 'Users.is_banned');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN banned_at TEXT', 'Users.banned_at');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN ban_reason TEXT', 'Users.ban_reason');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN phone TEXT', 'Users.phone');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN phone_verified INTEGER DEFAULT 0', 'Users.phone_verified');
    await addColumnIfMissing('ALTER TABLE Users ADD COLUMN session_version INTEGER DEFAULT 0', 'Users.session_version');
    await db.execute(`CREATE TABLE IF NOT EXISTS AuthSessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, version INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, expires_at INTEGER NOT NULL, last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP, label TEXT, FOREIGN KEY(user_id) REFERENCES Users(id) ON DELETE CASCADE)`);
    await db.execute('CREATE INDEX IF NOT EXISTS auth_sessions_user ON AuthSessions(user_id, expires_at)');
    await addColumnIfMissing('ALTER TABLE AuthSessions ADD COLUMN admin_generation INTEGER DEFAULT 0', 'AuthSessions.admin_generation');
    await db.execute(`CREATE TABLE IF NOT EXISTS AccountTokens (digest TEXT PRIMARY KEY, user_id INTEGER NOT NULL, purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES Users(id) ON DELETE CASCADE)`);

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

    await checkIdentityConflicts();
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_email_identity ON Users (LOWER(TRIM(email)))');
    await db.execute('CREATE TABLE IF NOT EXISTS SchemaMigrations (id TEXT PRIMARY KEY)');
    const ownerMigration = await db.execute("SELECT id FROM SchemaMigrations WHERE id = 'stored-owner-v1'");
    if (!ownerMigration.rows.length) {
      const { ownerEmails } = require('../utils/adminRules');
      const emails = ownerEmails();
      for (const email of emails) {
        await db.execute({
          sql: "UPDATE Users SET is_owner = 1 WHERE LOWER(role) = 'admin' AND LOWER(TRIM(email)) = ?",
          args: [email],
        });
      }
      if (emails.length) console.log('Existing trusted owner flags migrated; no new admin roles were granted.');
      await db.execute("INSERT INTO SchemaMigrations (id) VALUES ('stored-owner-v1')");
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
    await addColumnIfMissing('ALTER TABLE AiUsageDaily ADD COLUMN request_attempts INTEGER DEFAULT 0', 'AiUsageDaily.request_attempts');
    await addColumnIfMissing('ALTER TABLE AiUsageDaily ADD COLUMN reserved_tokens INTEGER DEFAULT 0', 'AiUsageDaily.reserved_tokens');
    await addColumnIfMissing('ALTER TABLE AiUsageDaily ADD COLUMN budget_epoch INTEGER DEFAULT 0', 'AiUsageDaily.budget_epoch');
    await db.execute('CREATE TABLE IF NOT EXISTS AiPoolDaily (usage_date TEXT PRIMARY KEY, free_attempts INTEGER DEFAULT 0)');
    await db.execute('INSERT OR IGNORE INTO AiPoolDaily (usage_date, free_attempts) SELECT usage_date, SUM(gemma_requests) FROM AiUsageDaily GROUP BY usage_date');

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
    await addColumnIfMissing('ALTER TABLE FlashcardReviews ADD COLUMN definition TEXT', 'FlashcardReviews.definition');
    await checkReviewConflicts();
    for (const sql of [
      'CREATE INDEX IF NOT EXISTS sessions_user_created ON Sessions (user_id, id DESC)',
      'CREATE INDEX IF NOT EXISTS quizzes_user_updated ON PremadeQuizzes (user_id, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS quizzes_public_created ON PremadeQuizzes (is_public, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS otp_user_purpose ON AdminOtps (user_id, purpose, id DESC)',
      'CREATE INDEX IF NOT EXISTS reviews_user_due ON FlashcardReviews (user_id, due_at)',
      'CREATE UNIQUE INDEX IF NOT EXISTS reviews_card_identity ON FlashcardReviews (user_id, COALESCE(session_id, 0), card_key)',
    ]) await db.execute(sql);
    await db.execute(`CREATE TABLE IF NOT EXISTS BillingCheckouts (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, customer_id TEXT, subscription_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS BillingSubscriptions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, customer_id TEXT NOT NULL, status TEXT NOT NULL,
      entitled INTEGER DEFAULT 0, entitled_until INTEGER DEFAULT 0, event_created INTEGER DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )`);
    await db.execute('CREATE INDEX IF NOT EXISTS billing_subscription_user ON BillingSubscriptions (user_id, entitled)');
    await db.execute('CREATE TABLE IF NOT EXISTS BillingEvents (id TEXT PRIMARY KEY, created INTEGER NOT NULL, processed_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    await addColumnIfMissing('ALTER TABLE BillingCheckouts ADD COLUMN expires_at INTEGER DEFAULT 0', 'BillingCheckouts.expires_at');
    await addColumnIfMissing("ALTER TABLE BillingCheckouts ADD COLUMN state TEXT DEFAULT 'open'", 'BillingCheckouts.state');
    await db.execute('CREATE TABLE IF NOT EXISTS BillingLocks (resource TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)');
    await db.execute('CREATE TABLE IF NOT EXISTS AiMinuteReservations (id TEXT PRIMARY KEY, pool TEXT NOT NULL, model TEXT NOT NULL, tokens INTEGER NOT NULL, created_at INTEGER NOT NULL)');
    await db.execute('CREATE INDEX IF NOT EXISTS ai_minute_model ON AiMinuteReservations(pool, model, created_at)');
    await db.execute('CREATE TABLE IF NOT EXISTS AiMonthlySpend (month TEXT NOT NULL, user_key TEXT NOT NULL, reserved_microusd INTEGER DEFAULT 0, PRIMARY KEY(month,user_key))');
    await db.execute('CREATE TABLE IF NOT EXISTS AiRequestEvents (id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT, outcome TEXT NOT NULL, status TEXT, elapsed_ms INTEGER, queue_ms INTEGER, provider_ms INTEGER, input_tokens INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    await db.execute('CREATE INDEX IF NOT EXISTS ai_events_created ON AiRequestEvents(created_at)');
    await db.execute("DELETE FROM AiRequestEvents WHERE created_at<datetime('now','-30 days')");
    await db.execute({sql:'DELETE FROM AuthSessions WHERE expires_at<?',args:[Date.now()]});
    await db.execute({sql:'DELETE FROM AccountTokens WHERE expires_at<?',args:[Date.now()]});
    
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
async function checkIdentityConflicts(client = db) {
  const conflicts = await client.execute('SELECT COUNT(*) AS c FROM (SELECT LOWER(TRIM(email)) FROM Users GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1)');
  if (Number(conflicts.rows[0].c)) throw new Error('Email identity conflicts must be reviewed before upgrading. Accounts were not merged or deleted. See SECURITY-UPGRADE.md.');
}

async function checkReviewConflicts(client = db) {
  const conflicts = await client.execute('SELECT COUNT(*) AS c FROM (SELECT user_id, COALESCE(session_id, 0), card_key FROM FlashcardReviews GROUP BY user_id, COALESCE(session_id, 0), card_key HAVING COUNT(*) > 1)');
  if (Number(conflicts.rows[0].c)) throw new Error('Duplicate flashcard reviews must be reviewed before upgrading. No records were deleted. See SECURITY-UPGRADE.md.');
}

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
  checkIdentityConflicts,
  checkReviewConflicts,
};
