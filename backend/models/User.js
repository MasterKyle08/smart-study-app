/**
 * @file backend/models/User.js
 * @description User model for database interactions related to users, using Turso client.
 */

const { db } = require('./db'); // Import the Turso client instance

/**
 * Represents a User.
 */
class User {
  /**
   * Creates a new user in the database.
   * @param {string} email - The user's email address.
   * @param {string} passwordHash - The hashed password.
   * @returns {Promise<object>} A promise that resolves with the new user object (id, email, created_at).
   * @throws {Error} If an error occurs during database operation.
   */
  static async create(email, passwordHash) {
    const sql = 'INSERT INTO Users (email, password_hash) VALUES (?, ?)';
    const params = [email, passwordHash];
    try {
      const result = await db.execute({ sql, args: params });
      // For Turso/libsql, lastInsertRowid gives the ID of the inserted row.
      const userId = result.lastInsertRowid; 
      if (!userId) {
        // This case should ideally not happen if the insert was successful and auto-increment is working.
        throw new Error('User creation succeeded but failed to get new user ID.');
      }
      return { 
        id: Number(userId), // Ensure ID is a number
        email, 
        created_at: new Date().toISOString() // Timestamp of creation
      };
    } catch (error) {
      console.error('Error creating user in Turso DB:', error.message);
      // Check for unique constraint violation (specific error codes might vary by driver/DB)
      if (error.message && error.message.toLowerCase().includes('unique constraint failed: users.email')) {
        const conflictError = new Error('Email already in use.');
        conflictError.statusCode = 409; // Conflict
        throw conflictError;
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Finds a user by their email address.
   * @param {string} email - The user's email address.
   * @returns {Promise<object|null>} A promise that resolves with the user object or null if not found.
   * @throws {Error} If an error occurs during database operation.
   */
  static async findByEmail(email) {
    const sql = 'SELECT * FROM Users WHERE email = ?';
    const params = [email];
    try {
      const result = await db.execute({ sql, args: params });
      if (result.rows.length > 0) {
        // Convert row data to a plain object if necessary (libsql rows are objects)
        return { ...result.rows[0] }; 
      }
      return null;
    } catch (error) {
      console.error('Error finding user by email in Turso DB:', error.message);
      throw error;
    }
  }

  /**
   * Finds a user by their ID.
   * @param {number} id - The user's ID.
   * @returns {Promise<object|null>} A promise that resolves with the user object (id, email, created_at) or null if not found.
   * @throws {Error} If an error occurs during database operation.
   */
  static async findById(id) {
    // Select only necessary fields, excluding password_hash for security where possible
    const sql = 'SELECT id, email, created_at FROM Users WHERE id = ?';
    const params = [id];
    try {
      const result = await db.execute({ sql, args: params });
      if (result.rows.length > 0) {
        return { ...result.rows[0] };
      }
      return null;
    } catch (error) {
      console.error('Error finding user by ID in Turso DB:', error.message);
      throw error;
    }
  }
}

module.exports = User;
