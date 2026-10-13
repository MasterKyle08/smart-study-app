/**
 * @file server.js
 * @description Main server file for the Smart Study AI application.
 * Initializes the Express app, database (now Turso), and starts the server.
 */

const { configureRuntime } = require('./backend/config/environment');
const runtime = configureRuntime();

const app = require('./backend/app'); // Import the configured Express app
const { db, init: initDB, close: closeDB } = require('./backend/models/db');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Initializes the database and starts the Express server.
 */
async function startServer() {
  try {
    // Production applies the schema; local startup checks the shared database.
    if (runtime.production) {
      await initDB();
      console.log('Turso Database initialized successfully.');
    } else {
      await db.execute('PRAGMA foreign_keys = ON;');
      await db.execute('SELECT id FROM Users LIMIT 0');
      console.log('Local development: real free Gemma, existing Turso, separate login tokens. Startup migrations and cleanup are disabled.');
    }
    if (!process.env.ADMIN_EMAIL) {
      console.warn('ADMIN_EMAIL is not set. Set it to your account email to bootstrap the owner admin (cannot be demoted).');
    }
    if (runtime.production) {
      try {
        const Session = require('./backend/models/Session');
        const hours = parseInt(process.env.ANONYMOUS_SESSION_TTL_HOURS || '24', 10);
        const removed = await Session.deleteAnonymousOlderThan(hours);
        if (removed) console.log(`Removed ${removed} expired anonymous session(s).`);
      } catch (cleanupError) {
        console.warn('Anonymous session cleanup skipped:', cleanupError.message);
      }
    }

    // Start the Express server
    app.listen(PORT, HOST, () => {
      console.log(`Smart Study AI server listening on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    // Attempt to close DB connection if it was opened, before exiting
    try {
      await closeDB(); // closeDB is now async
    } catch (closeError) {
      console.error('Failed to close database connection during server start error:', closeError);
    }
    process.exit(1); // Exit the process with an error code
  }
}

// Start the server
startServer();

// Graceful shutdown handling
async function gracefulShutdown() {
  console.log('Server shutting down...');
  try {
    await closeDB(); // Ensure DB connection is closed
    console.log('Turso Database connection closed.');
  } catch (error) {
    console.error('Error closing Turso database connection during shutdown:', error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
