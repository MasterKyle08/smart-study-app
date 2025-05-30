/**
 * @file backend/models/db.js
 * @description SQLite database setup and initialization.
 * Creates tables if they don't exist.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Determine the database path. Use environment variable or default.
const dbPath = process.env.DATABASE_URL 
  ? (process.env.DATABASE_URL.startsWith('./') ? path.resolve(__dirname, '..', '..', process.env.DATABASE_URL) : process.env.DATABASE_URL)
  : path.resolve(__dirname, '..', '..', 'db', 'smart_study.sqlite');

// Ensure the db directory exists (though sqlite3 can create the file, not the directory)
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

/**
 * SQLite database connection instance.
 * @type {sqlite3.Database}
 */
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
    throw err; // Throw error to prevent app from starting with faulty DB
  }
  console.log(`Connected to SQLite database at ${dbPath}`);
  // Enable foreign key support
  db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
    if (pragmaErr) {
      console.error("Failed to enable foreign key support:", pragmaErr.message);
    } else {
      console.log("Foreign key support enabled.");
    }
  });
});

/**
 * SQL statements to create necessary tables.
 */
const createTablesSQL = `
  CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS Sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    original_filename TEXT,
    original_content_type TEXT, -- e.g., 'text/plain', 'image/jpeg', 'application/pdf'
    extracted_text TEXT,
    summary TEXT,
    flashcards TEXT, -- Store as JSON string
    quiz TEXT, -- Store as JSON string
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
  );

  -- Trigger to update 'updated_at' timestamp on Sessions table update
  CREATE TRIGGER IF NOT EXISTS update_sessions_updated_at
  AFTER UPDATE ON Sessions
  FOR EACH ROW
  BEGIN
    UPDATE Sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
  END;
`;

/**
 * Initializes the database by creating tables if they don't exist.
 * @returns {Promise<void>} A promise that resolves when tables are created.
 */
function init() {
  return new Promise((resolve, reject) => {
    db.exec(createTablesSQL, (err) => {
      if (err) {
        console.error('Error creating tables:', err.message);
        return reject(err);
      }
      console.log('Database tables checked/created successfully.');
      resolve();
    });
  });
}

/**
 * Closes the database connection.
 * @param {function} [callback] - Optional callback function.
 */
function close(callback) {
  db.close(callback);
}

// Handle command line argument for explicit DB initialization
if (require.main !== module && process.argv[2] === 'init') {
  console.log('Manual DB initialization requested...');
  init().then(() => {
    console.log('Manual DB initialization complete.');
    close();
  }).catch(err => {
    console.error('Manual DB initialization failed:', err);
    close();
    process.exit(1);
  });
}


module.exports = {
  db,
  init, // Export init function
  close
};
