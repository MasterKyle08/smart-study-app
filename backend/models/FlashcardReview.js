const { db } = require('./db');
const { writeTransaction } = require('../utils/transaction');
const { reviewCard } = require('../utils/srs');

class FlashcardReview {
  static async review({ userId, sessionId, cardKey, quality, definition = '' }) {
    const storeDefinition=await require('../services/localState').hasColumn('FlashcardReviews','definition');
    return writeTransaction(async tx => {
      const current = await tx.execute({ sql: 'SELECT * FROM FlashcardReviews WHERE user_id = ? AND COALESCE(session_id, 0) = ? AND card_key = ?', args: [userId, sessionId || 0, cardKey] });
      const next = reviewCard(this.format(current.rows[0]) || {}, quality);
      const saved = await tx.execute({ sql: `INSERT INTO FlashcardReviews (user_id, session_id, card_key, term, repetitions, interval_days, ease_factor, due_at, last_quality, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET term = excluded.term, repetitions = excluded.repetitions, interval_days = excluded.interval_days, ease_factor = excluded.ease_factor, due_at = excluded.due_at, last_quality = excluded.last_quality, last_reviewed_at = excluded.last_reviewed_at RETURNING *`, args: [userId, sessionId, cardKey, cardKey, next.repetitions, next.intervalDays, next.easeFactor, next.dueAt, next.lastQuality, next.lastReviewedAt] });
      if(storeDefinition)await tx.execute({sql:'UPDATE FlashcardReviews SET definition=? WHERE id=?',args:[definition,saved.rows[0].id]});
      saved.rows[0].definition=definition;
      return this.format(saved.rows[0]);
    });
  }
  static format(row) {
    if (!row) return null;
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      sessionId: row.session_id == null ? null : Number(row.session_id),
      cardKey: row.card_key,
      term: row.term,
      definition:row.definition || '',
      repetitions: Number(row.repetitions) || 0,
      intervalDays: Number(row.interval_days) || 0,
      easeFactor: Number(row.ease_factor) || 2.5,
      dueAt: row.due_at,
      lastQuality: row.last_quality == null ? null : Number(row.last_quality),
      lastReviewedAt: row.last_reviewed_at,
    };
  }

  static async upsert({ userId, sessionId, cardKey, term, review }) {
    return writeTransaction(async tx => {
      const saved = await tx.execute({
        sql: 'INSERT INTO FlashcardReviews (user_id, session_id, card_key, term, repetitions, interval_days, ease_factor, due_at, last_quality, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET term = excluded.term, repetitions = excluded.repetitions, interval_days = excluded.interval_days, ease_factor = excluded.ease_factor, due_at = excluded.due_at, last_quality = excluded.last_quality, last_reviewed_at = excluded.last_reviewed_at RETURNING *',
        args: [userId, sessionId || null, cardKey, term || cardKey, review.repetitions, review.intervalDays, review.easeFactor, review.dueAt, review.lastQuality, review.lastReviewedAt],
      });
      return this.format(saved.rows[0]);
    });
  }

  static async findOne(userId, sessionId, cardKey) {
    const sql = sessionId
      ? 'SELECT * FROM FlashcardReviews WHERE user_id = ? AND session_id = ? AND card_key = ? LIMIT 1'
      : 'SELECT * FROM FlashcardReviews WHERE user_id = ? AND session_id IS NULL AND card_key = ? LIMIT 1';
    const args = sessionId ? [userId, sessionId, cardKey] : [userId, cardKey];
    const result = await db.execute({ sql, args });
    return result.rows.length ? this.format(result.rows[0]) : null;
  }

  static async listDue(userId, { sessionId, includeUpcoming = false, limit = 24, offset = 0 } = {}) {
    let sql = 'SELECT r.*,s.flashcards AS source_cards FROM FlashcardReviews r LEFT JOIN Sessions s ON s.id=r.session_id AND s.user_id=r.user_id WHERE r.user_id = ?';
    const args = [userId];
    if (sessionId) {
      sql += ' AND r.session_id = ?';
      args.push(sessionId);
    }
    if (!includeUpcoming) {
      sql += ` AND due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
    }
    sql += ' ORDER BY due_at ASC';
    sql += ' LIMIT ? OFFSET ?'; args.push(Math.min(50,Math.max(1,Number(limit)||24)),Math.max(0,Number(offset)||0));
    const result = await db.execute({ sql, args });
    return result.rows.map(row=>{if(!row.definition&&row.source_cards){try{row.definition=JSON.parse(row.source_cards).find(card=>card.term===row.card_key)?.definition||'';}catch{}}return this.format(row);});
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
