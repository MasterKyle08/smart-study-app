/**
 * @file backend/models/Session.js
 * @description Session model for database interactions related to study sessions.
 */

const { db } = require('./db');

/**
 * Represents a Study Session.
 */
class Session {
  /**
   * Creates a new study session.
   * @param {object} sessionData - Data for the new session.
   * @param {number|null} sessionData.userId - ID of the user (null for anonymous).
   * @param {string} sessionData.originalFilename - Name of the original uploaded file.
   * @param {string} sessionData.originalContentType - MIME type of the original file.
   * @param {string} sessionData.extractedText - Text extracted from the file.
   * @param {string|null} [sessionData.summary] - Generated summary.
   * @param {string|null} [sessionData.flashcards] - Generated flashcards (JSON string).
   * @param {string|null} [sessionData.quiz] - Generated quiz (JSON string).
   * @returns {Promise<object>} A promise that resolves with the new session object.
   */
  static create({ userId, originalFilename, originalContentType, extractedText, summary = null, flashcards = null, quiz = null }) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO Sessions 
          (user_id, original_filename, original_content_type, extracted_text, summary, flashcards, quiz) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [userId, originalFilename, originalContentType, extractedText, summary, flashcards, quiz];
      
      db.run(sql, params, function (err) {
        if (err) {
          console.error('Error creating session:', err.message);
          return reject(err);
        }
        resolve({ 
          id: this.lastID, 
          userId, 
          originalFilename, 
          originalContentType, 
          extractedText, 
          summary, 
          flashcards, 
          quiz,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Finds a session by its ID.
   * @param {number} id - The session ID.
   * @returns {Promise<object|null>} A promise that resolves with the session object or null if not found.
   */
  static findById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM Sessions WHERE id = ?';
      db.get(sql, [id], (err, row) => {
        if (err) {
          console.error('Error finding session by ID:', err.message);
          return reject(err);
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Finds all sessions for a given user ID.
   * @param {number} userId - The user's ID.
   * @returns {Promise<Array<object>>} A promise that resolves with an array of session objects.
   */
  static findByUserId(userId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM Sessions WHERE user_id = ? ORDER BY created_at DESC';
      db.all(sql, [userId], (err, rows) => {
        if (err) {
          console.error('Error finding sessions by user ID:', err.message);
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  /**
   * Updates a session with new AI-generated content.
   * @param {number} id - The session ID to update.
   * @param {object} dataToUpdate - Object containing fields to update (summary, flashcards, quiz).
   * @param {string|null} [dataToUpdate.summary] - New summary.
   * @param {string|null} [dataToUpdate.flashcards] - New flashcards (JSON string).
   * @param {string|null} [dataToUpdate.quiz] - New quiz (JSON string).
   * @returns {Promise<object>} A promise that resolves with the updated session object.
   */
  static updateAiContent(id, { summary, flashcards, quiz }) {
    return new Promise((resolve, reject) => {
      // Build the SET part of the SQL query dynamically
      const fieldsToUpdate = [];
      const params = [];

      if (summary !== undefined) {
        fieldsToUpdate.push('summary = ?');
        params.push(summary);
      }
      if (flashcards !== undefined) {
        fieldsToUpdate.push('flashcards = ?');
        params.push(flashcards);
      }
      if (quiz !== undefined) {
        fieldsToUpdate.push('quiz = ?');
        params.push(quiz);
      }

      if (fieldsToUpdate.length === 0) {
        return reject(new Error('No fields provided for update.'));
      }

      // Add the session ID to the params for the WHERE clause
      params.push(id);

      const sql = `
        UPDATE Sessions 
        SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      db.run(sql, params, function (err) {
        if (err) {
          console.error('Error updating session AI content:', err.message);
          return reject(err);
        }
        if (this.changes === 0) {
          return reject(new Error(`Session with ID ${id} not found or no changes made.`));
        }
        // Fetch and return the updated session
        Session.findById(id).then(resolve).catch(reject);
      });
    });
  }
  
  /**
   * Deletes a session by its ID.
   * @param {number} id - The session ID.
   * @param {number} userId - The ID of the user requesting deletion (for authorization).
   * @returns {Promise<boolean>} A promise that resolves with true if deletion was successful.
   */
  static deleteById(id, userId) {
    return new Promise((resolve, reject) => {
      // Ensure the session belongs to the user trying to delete it
      const sql = 'DELETE FROM Sessions WHERE id = ? AND user_id = ?';
      db.run(sql, [id, userId], function (err) {
        if (err) {
          console.error('Error deleting session:', err.message);
          return reject(err);
        }
        if (this.changes === 0) {
          // Either session not found or not owned by this user
          return reject(new Error(`Session with ID ${id} not found or user not authorized to delete.`));
        }
        resolve(true);
      });
    });
  }
}

module.exports = Session;
