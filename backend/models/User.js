/**
 * @file backend/models/User.js
 * @description User model for database interactions related to users.
 */

const { db } = require('./db'); // Import the SQLite database connection instance

/**
 * Represents a User.
 */
class User {
  /**
   * Creates a new user in the database.
   * @param {string} email - The user's email address.
   * @param {string} passwordHash - The hashed password.
   * @returns {Promise<object>} A promise that resolves with the new user object (id, email, created_at).
   */
  static create(email, passwordHash) {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO Users (email, password_hash) VALUES (?, ?)';
      db.run(sql, [email, passwordHash], function (err) {
        if (err) {
          console.error('Error creating user:', err.message);
          return reject(err);
        }
        // Return the newly created user's details (excluding password_hash for security)
        resolve({ id: this.lastID, email, created_at: new Date().toISOString() });
      });
    });
  }

  /**
   * Finds a user by their email address.
   * @param {string} email - The user's email address.
   * @returns {Promise<object|null>} A promise that resolves with the user object or null if not found.
   */
  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM Users WHERE email = ?';
      db.get(sql, [email], (err, row) => {
        if (err) {
          console.error('Error finding user by email:', err.message);
          return reject(err);
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Finds a user by their ID.
   * @param {number} id - The user's ID.
   * @returns {Promise<object|null>} A promise that resolves with the user object or null if not found.
   */
  static findById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT id, email, created_at FROM Users WHERE id = ?';
      db.get(sql, [id], (err, row) => {
        if (err) {
          console.error('Error finding user by ID:', err.message);
          return reject(err);
        }
        resolve(row || null);
      });
    });
  }
}

module.exports = User;
