/**
 * @file backend/models/Session.js
 * @description Session model for database interactions related to study sessions, using Turso client.
 */

const { db } = require('./db'); // Import the Turso client instance
const { writeTransaction } = require('../utils/transaction');

/**
 * Represents a Study Session.
 */
class Session {
  static async listSummaries(userId, { before, limit = 24 } = {}) {
    const take = Math.min(50, Math.max(1, Math.floor(Number(limit) || 24)));
    const cursor = before == null ? null : Number(before);
    if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 1)) throw Object.assign(new Error('Invalid page cursor.'), { statusCode: 400 });
    const result = await db.execute({ sql: `SELECT id, original_filename, original_content_type, created_at, updated_at, SUBSTR(summary, 1, 160) AS summary FROM Sessions WHERE user_id = ?${cursor === null ? '' : ' AND id < ?'} ORDER BY id DESC LIMIT ?`, args: [userId, ...(cursor === null ? [] : [cursor]), take + 1] });
    const more = result.rows.length > take;
    const sessions = result.rows.slice(0, take).map(row => ({ ...row, id: Number(row.id) }));
    return { sessions, nextCursor: more ? sessions[sessions.length - 1].id : null };
  }
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
   * @throws {Error} If an error occurs during database operation.
   */
  static async create({ userId, originalFilename = null, originalContentType = null, extractedText, summary = null, flashcards = null, quiz = null, quizOptions = null, citations = [] }) {
    if(!await require('../services/localState').hasColumn('Sessions','citations')){
      const result=await db.execute({sql:'INSERT INTO Sessions(user_id,original_filename,original_content_type,extracted_text,summary,flashcards,quiz,quiz_options) VALUES (?,?,?,?,?,?,?,?)',args:[userId,originalFilename,originalContentType,extractedText,summary,flashcards,quiz,quizOptions?JSON.stringify(quizOptions):null]});return {id:Number(result.lastInsertRowid)};
    }
    const sql = `
      INSERT INTO Sessions 
        (user_id, original_filename, original_content_type, extracted_text, summary, flashcards, quiz, quiz_options,citations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [userId, originalFilename, originalContentType, extractedText, summary, flashcards, quiz, quizOptions ? JSON.stringify(quizOptions) : null,JSON.stringify(citations)];
    
    try {
      const result = await db.execute({ sql, args: params });
      const sessionId = result.lastInsertRowid;
      if (!sessionId) {
        throw new Error('Session creation succeeded but failed to get new session ID.');
      }
      return { 
        id: Number(sessionId), 
        userId: userId == null ? null : Number(userId), 
        originalFilename, 
        originalContentType, 
        extractedText, 
        summary, 
        flashcards, 
        quiz,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error creating session in Turso DB:', error.message);
      throw error;
    }
  }

  /**
   * Finds a session by its ID.
   * @param {number} id - The session ID.
   * @returns {Promise<object|null>} A promise that resolves with the session object or null if not found.
   * @throws {Error} If an error occurs during database operation.
   */
  static async findById(id) {
    const sql = 'SELECT * FROM Sessions WHERE id = ?';
    const params = [id];
    try {
      const result = await db.execute({ sql, args: params });
      if (result.rows.length === 0) return null;
      const row = { ...result.rows[0] };
      row.id = Number(row.id);
      row.user_id = row.user_id == null ? null : Number(row.user_id);
      return row;
    } catch (error) {
      console.error('Error finding session by ID in Turso DB:', error.message);
      throw error;
    }
  }

  /**
   * Finds all sessions for a given user ID.
   * @param {number} userId - The user's ID.
   * @returns {Promise<Array<object>>} A promise that resolves with an array of session objects.
   * @throws {Error} If an error occurs during database operation.
   */
  static async findByUserId(userId) {
    const sql = 'SELECT * FROM Sessions WHERE user_id = ? ORDER BY created_at DESC';
    const params = [userId];
    try {
      const result = await db.execute({ sql, args: params });
      return result.rows.map((row) => {
        const session = { ...row };
        session.id = Number(session.id);
        session.user_id = session.user_id == null ? null : Number(session.user_id);
        return session;
      });
    } catch (error) {
      console.error('Error finding sessions by user ID in Turso DB:', error.message);
      throw error;
    }
  }

  /**
   * Updates a session with new AI-generated content.
   * @param {number} id - The session ID to update.
   * @param {object} dataToUpdate - Object containing fields to update (summary, flashcards, quiz).
   * @param {string|null} [dataToUpdate.summary] - New summary.
   * @param {string|null} [dataToUpdate.flashcards] - New flashcards (JSON string).
   * @param {string|null} [dataToUpdate.quiz] - New quiz (JSON string).
   * @returns {Promise<object>} A promise that resolves with the updated session object.
   * @throws {Error} If no fields provided, session not found, or DB error.
   */
  static async updateAiContent(id, { summary, flashcards, quiz, quizOptions, citations }) {
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
    if (quizOptions !== undefined) {
      fieldsToUpdate.push('quiz_options = ?');
      params.push(JSON.stringify(quizOptions));
    }
    if(citations!==undefined&&await require('../services/localState').hasColumn('Sessions','citations')){fieldsToUpdate.push('citations = ?');params.push(JSON.stringify(citations));}

    if (fieldsToUpdate.length === 0) {
      const error = new Error('No fields provided for update.');
      error.statusCode = 400;
      throw error;
    }

    // Add current timestamp for updated_at
    // No need to add updated_at to fieldsToUpdate if trigger handles it.
    // If trigger is not reliably working or for explicit control:
    // fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP'); 
    // The trigger should handle this, so we keep it simple here.

    const sql = `
      UPDATE Sessions 
      SET ${fieldsToUpdate.join(', ')} 
      WHERE id = ?
    `;
    params.push(id); // Add session ID to the end for the WHERE clause

    try {
      const result = await db.execute({ sql, args: params });
      if (result.rowsAffected === 0) {
        throw new Error(`Session with ID ${id} not found or no changes made.`);
      }
      // Fetch and return the updated session
      return await Session.findById(id);
    } catch (error) {
      console.error('Error updating session AI content in Turso DB:', error.message);
      throw error;
    }
  }
  
  /**
   * Deletes a session by its ID, ensuring it belongs to the user.
   * @param {number} id - The session ID.
   * @param {number} userId - The ID of the user requesting deletion (for authorization).
   * @returns {Promise<boolean>} A promise that resolves with true if deletion was successful.
   * @throws {Error} If session not found, user not authorized, or DB error.
   */
  static async deleteById(id, userId) {
    return writeTransaction(async tx => {
      const owned = await tx.execute({ sql:'SELECT id FROM Sessions WHERE id=? AND user_id=?', args:[id,userId] });
      if (!owned.rows.length) throw Object.assign(new Error('Session not found.'), { statusCode:404 });
      await tx.execute({ sql:'DELETE FROM FlashcardReviews WHERE session_id=? AND user_id=?', args:[id,userId] });
      await tx.execute({ sql:'DELETE FROM Sessions WHERE id=? AND user_id=?', args:[id,userId] });
      return true;
    });
  }

  static async deleteByUserId(userId) {
    const result = await db.execute({
      sql: 'DELETE FROM Sessions WHERE user_id = ?',
      args: [userId],
    });
    return result.rowsAffected || 0;
  }

  static async deleteAnonymousOlderThan(hours = 24) {
    const windowHours = Math.max(1, parseInt(hours, 10) || 24);
    const sql = `DELETE FROM Sessions WHERE user_id IS NULL AND created_at < datetime('now', ?)`;
    const result = await db.execute({ sql, args: [`-${windowHours} hours`] });
    return result.rowsAffected || 0;
  }
}

module.exports = Session;
