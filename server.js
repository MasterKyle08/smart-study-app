/**
 * @file server.js
 * @description Main server file for the Smart Study AI application.
 * Initializes the Express app, database (now Turso), and starts the server.
 */

require('dotenv').config(); // Load environment variables from .env file

const app = require('./backend/app'); // Import the configured Express app
const { init: initDB, close: closeDB } = require('./backend/models/db'); // Import Turso DB functions

const PORT = process.env.PORT || 3000; // Use port from environment or default to 3000

/**
 * Initializes the database and starts the Express server.
 */
async function startServer() {
  try {
    // Initialize the database (create tables if they don't exist using Turso client)
    await initDB(); // initDB is now async
    console.log('Turso Database initialized successfully.');

    // Start the Express server
    app.listen(PORT, () => {
      console.log(`Smart Study AI server running on port ${PORT}`);
      console.log(`Access the app at http://localhost:${PORT}`);
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
