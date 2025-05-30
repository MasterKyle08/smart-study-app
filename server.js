/**
 * @file server.js
 * @description Main entry point for the Smart Study application.
 * Initializes the environment, database, and starts the Express server.
 */

require('dotenv').config(); // Load environment variables from .env file

const http = require('http');
const app = require('./backend/app'); // Import the Express app configuration
const db = require('./backend/models/db'); // Import database setup

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

/**
 * Initializes the database and starts the server.
 */
async function startServer() {
  try {
    // Initialize the database (create tables if they don't exist)
    await db.init(); // This now calls the exported init function
    console.log('Database initialized successfully.');

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Access the application at http://localhost:${PORT}`);
      if (process.env.NODE_ENV === 'development') {
        console.log('Development mode is ON.');
      }
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1); // Exit if server fails to start
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  db.close((err) => {
    if (err) {
      console.error('Error closing the database connection:', err.message);
    } else {
      console.log('Database connection closed.');
    }
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});

startServer();
