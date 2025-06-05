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

/**
 * Initializes the database by creating tables if they don't exist.
 * Executes DDL statements sequentially.
 * @returns {Promise<void>} A promise that resolves when tables are created.
 */
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
    
    // Removed await db.sync(); as it's not supported in HTTP mode.
    // Schema changes over HTTP are typically committed immediately by the server.
    
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
