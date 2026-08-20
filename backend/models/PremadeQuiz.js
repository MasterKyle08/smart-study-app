/**
 * @file backend/models/PremadeQuiz.js
 * @description Model for premade quiz records stored in Turso.
 */

const { db } = require('./db');

class PremadeQuiz {
  static #formatRow(row, { includeQuiz = false } = {}) {
    if (!row) return null;

    let tags = [];
    if (row.tags) {
      try {
        const parsed = JSON.parse(row.tags);
        if (Array.isArray(parsed)) tags = parsed;
      } catch (error) {
        console.warn('Failed to parse premade quiz tags JSON. Falling back to empty array.', error.message);
      }
    }

    let quizOptions = null;
    if (row.quiz_options) {
      try {
        quizOptions = JSON.parse(row.quiz_options);
      } catch (error) {
        console.warn('Failed to parse premade quiz options JSON.', error.message);
      }
    }

    let quizArray = [];
    if (row.quiz_json) {
      try {
        quizArray = JSON.parse(row.quiz_json);
      } catch (error) {
        console.error('Failed to parse premade quiz JSON.', error.message);
      }
    }

    return {
      id: Number(row.id),
      userId: row.user_id == null ? null : Number(row.user_id),
      title: row.title,
      slug: row.slug,
      description: row.description,
      topic: row.topic,
      tags,
      sourceText: includeQuiz ? row.source_text : undefined,
      quizOptions,
      questionCount: Array.isArray(quizArray) ? quizArray.length : 0,
      quiz: includeQuiz ? quizArray : undefined,
      isPublic: row.is_public === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async create({ userId, title, slug, description, topic, tags, sourceText, quizJson, quizOptions, isPublic = true }) {
    const sql = `
      INSERT INTO PremadeQuizzes (user_id, title, slug, description, topic, tags, source_text, quiz_json, quiz_options, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      userId,
      title,
      slug,
      description || null,
      topic || null,
      tags ? JSON.stringify(tags) : null,
      sourceText || null,
      JSON.stringify(quizJson),
      quizOptions ? JSON.stringify(quizOptions) : null,
      isPublic ? 1 : 0,
    ];

    const result = await db.execute({ sql, args: params });
    const insertedId = result.lastInsertRowid;
    if (!insertedId) {
      throw new Error('Premade quiz created but no ID returned.');
    }
    return this.findById(Number(insertedId), { includeQuiz: true });
  }

  static async findById(id, { includeQuiz = false } = {}) {
    const sql = 'SELECT * FROM PremadeQuizzes WHERE id = ?';
    const result = await db.execute({ sql, args: [id] });
    if (result.rows.length === 0) return null;
    return this.#formatRow(result.rows[0], { includeQuiz });
  }

  static async findBySlug(slug, { includeQuiz = false, includePrivate = false } = {}) {
    const sql = includePrivate
      ? 'SELECT * FROM PremadeQuizzes WHERE slug = ?'
      : 'SELECT * FROM PremadeQuizzes WHERE slug = ? AND is_public = 1';
    const result = await db.execute({ sql, args: [slug] });
    if (result.rows.length === 0) return null;
    return this.#formatRow(result.rows[0], { includeQuiz });
  }

  static async listByUserId(userId) {
    const result = await db.execute({
      sql: 'SELECT * FROM PremadeQuizzes WHERE user_id = ? ORDER BY updated_at DESC',
      args: [userId],
    });
    return result.rows.map((row) => this.#formatRow(row, { includeQuiz: false }));
  }

  static async updateById(id, { title, description, topic, tags, isPublic, quizJson, quizOptions }) {
    const fields = [];
    const args = [];
    if (title !== undefined) { fields.push('title = ?'); args.push(title); }
    if (description !== undefined) { fields.push('description = ?'); args.push(description); }
    if (topic !== undefined) { fields.push('topic = ?'); args.push(topic); }
    if (tags !== undefined) { fields.push('tags = ?'); args.push(JSON.stringify(tags || [])); }
    if (isPublic !== undefined) { fields.push('is_public = ?'); args.push(isPublic ? 1 : 0); }
    if (quizJson !== undefined) { fields.push('quiz_json = ?'); args.push(JSON.stringify(quizJson)); }
    if (quizOptions !== undefined) { fields.push('quiz_options = ?'); args.push(JSON.stringify(quizOptions)); }
    if (!fields.length) return this.findById(id, { includeQuiz: true });
    args.push(id);
    await db.execute({ sql: `UPDATE PremadeQuizzes SET ${fields.join(', ')} WHERE id = ?`, args });
    return this.findById(id, { includeQuiz: true });
  }

  static async deleteById(id, userId) {
    const result = await db.execute({
      sql: 'DELETE FROM PremadeQuizzes WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (!result.rowsAffected) {
      const error = new Error('Quiz not found or you do not own it.');
      error.statusCode = 404;
      throw error;
    }
    return true;
  }

  static async deleteByIdAdmin(id) {
    const result = await db.execute({
      sql: 'DELETE FROM PremadeQuizzes WHERE id = ?',
      args: [id],
    });
    if (!result.rowsAffected) {
      const error = new Error('Quiz not found.');
      error.statusCode = 404;
      throw error;
    }
    return true;
  }

  static async deleteByUserId(userId) {
    const result = await db.execute({
      sql: 'DELETE FROM PremadeQuizzes WHERE user_id = ?',
      args: [userId],
    });
    return result.rowsAffected || 0;
  }

  static async listAll({ search, limit = 50 } = {}) {
    let sql = 'SELECT * FROM PremadeQuizzes';
    const params = [];
    if (search && String(search).trim() !== '') {
      sql += ' WHERE (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(topic) LIKE ? OR LOWER(slug) LIKE ?)';
      const likeTerm = `%${String(search).trim().toLowerCase()}%`;
      params.push(likeTerm, likeTerm, likeTerm, likeTerm);
    }
    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(Math.min(100, Number(limit) || 50));
    const result = await db.execute({ sql, args: params });
    return result.rows.map((row) => this.#formatRow(row, { includeQuiz: false }));
  }

  static async listPublic({ search, limit = 50 } = {}) {
    let sql = 'SELECT * FROM PremadeQuizzes WHERE is_public = 1';
    const params = [];

    if (search && search.trim() !== '') {
      sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(topic) LIKE ? OR LOWER(tags) LIKE ?)';
      const likeTerm = `%${search.trim().toLowerCase()}%`;
      params.push(likeTerm, likeTerm, likeTerm, likeTerm);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const result = await db.execute({ sql, args: params });
    return result.rows.map(row => this.#formatRow(row, { includeQuiz: false }));
  }

  static async slugExists(slug) {
    const sql = 'SELECT 1 FROM PremadeQuizzes WHERE slug = ? LIMIT 1';
    const result = await db.execute({ sql, args: [slug] });
    return result.rows.length > 0;
  }
}

module.exports = PremadeQuiz;
