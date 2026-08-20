const { db } = require('./db');

class FlashcardReview {
  static format(row) {
    if (!row) return null;
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      sessionId: row.session_id == null ? null : Number(row.session_id),
      cardKey: row.card_key,
      term: row.term,
      repetitions: Number(row.repetitions) || 0,
      intervalDays: Number(row.interval_days) || 0,
      easeFactor: Number(row.ease_factor) || 2.5,
      dueAt: row.due_at,
      lastQuality: row.last_quality == null ? null : Number(row.last_quality),
      lastReviewedAt: row.last_reviewed_at,
    };
  }

  static async upsert({ userId, sessionId, cardKey, term, review }) {
    const existing = await this.findOne(userId, sessionId, cardKey);
    if (!existing) {
      const sql = `INSERT INTO FlashcardReviews
        (user_id, session_id, card_key, term, repetitions, interval_days, ease_factor, due_at, last_quality, last_reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      await db.execute({
        sql,
        args: [
          userId,
          sessionId || null,
          cardKey,
          term || cardKey,
          review.repetitions,
          review.intervalDays,
          review.easeFactor,
          review.dueAt,
          review.lastQuality,
          review.lastReviewedAt,
        ],
      });
      return this.findOne(userId, sessionId, cardKey);
    }

    await db.execute({
      sql: `UPDATE FlashcardReviews
        SET repetitions = ?, interval_days = ?, ease_factor = ?, due_at = ?, last_quality = ?, last_reviewed_at = ?, term = ?
        WHERE id = ?`,
      args: [
        review.repetitions,
        review.intervalDays,
        review.easeFactor,
        review.dueAt,
        review.lastQuality,
        review.lastReviewedAt,
        term || existing.term,
        existing.id,
      ],
    });
    return this.findOne(userId, sessionId, cardKey);
  }

  static async findOne(userId, sessionId, cardKey) {
    const sql = sessionId
      ? 'SELECT * FROM FlashcardReviews WHERE user_id = ? AND session_id = ? AND card_key = ? LIMIT 1'
      : 'SELECT * FROM FlashcardReviews WHERE user_id = ? AND session_id IS NULL AND card_key = ? LIMIT 1';
    const args = sessionId ? [userId, sessionId, cardKey] : [userId, cardKey];
    const result = await db.execute({ sql, args });
    return result.rows.length ? this.format(result.rows[0]) : null;
  }

  static async listDue(userId, { sessionId, includeUpcoming = false } = {}) {
    let sql = 'SELECT * FROM FlashcardReviews WHERE user_id = ?';
    const args = [userId];
    if (sessionId) {
      sql += ' AND session_id = ?';
      args.push(sessionId);
    }
    if (!includeUpcoming) {
      sql += ` AND due_at <= datetime('now')`;
    }
    sql += ' ORDER BY due_at ASC';
    const result = await db.execute({ sql, args });
    return result.rows.map((row) => this.format(row));
  }

  static async deleteByUserId(userId) {
    const result = await db.execute({
      sql: 'DELETE FROM FlashcardReviews WHERE user_id = ?',
      args: [userId],
    });
    return result.rowsAffected || 0;
  }
}

module.exports = FlashcardReview;
