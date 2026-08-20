/**
 * @file backend/models/User.js
 * @description User model for database interactions related to users, using Turso client.
 */

const { db } = require('./db'); // Import the Turso client instance
const { isOwnerEmail, isAdminUser, maskPhone } = require('../utils/adminRules');

const PUBLIC_COLUMNS = 'id, email, created_at, plan, role, is_banned, banned_at, ban_reason, phone, phone_verified, stripe_customer_id, billing_provider';

function formatUser(row, { includePhone = false, includePassword = false } = {}) {
  if (!row) return null;
  const user = { ...row };
  user.id = Number(user.id);
  user.plan = user.plan || 'free';
  user.role = isOwnerEmail(user.email) ? 'admin' : (String(user.role || 'user').toLowerCase() === 'admin' ? 'admin' : 'user');
  user.is_banned = Number(user.is_banned) || 0;
  user.phone_verified = Number(user.phone_verified) || 0;
  user.isAdmin = isAdminUser(user);
  user.isOwner = isOwnerEmail(user.email);
  user.isBanned = Boolean(user.is_banned);
  user.phoneMasked = maskPhone(user.phone);
  if (!includePhone) delete user.phone;
  if (!includePassword) delete user.password_hash;
  return user;
}

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
      const created = {
        id: Number(userId),
        email,
        plan: 'free',
        role: isOwnerEmail(email) ? 'admin' : 'user',
        created_at: new Date().toISOString(),
      };
      if (created.role === 'admin') {
        try {
          await db.execute({ sql: "UPDATE Users SET role = 'admin' WHERE id = ?", args: [created.id] });
        } catch (_err) { /* column may not exist yet on first boot */ }
      }
      return formatUser(created);
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
        return formatUser(result.rows[0], { includePhone: true, includePassword: true });
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
    const sql = `SELECT ${PUBLIC_COLUMNS} FROM Users WHERE id = ?`;
    const params = [id];
    try {
      const result = await db.execute({ sql, args: params });
      if (result.rows.length > 0) {
        return formatUser(result.rows[0], { includePhone: true });
      }
      return null;
    } catch (error) {
      if ((error.message || '').toLowerCase().includes('no such column')) {
        const fallback = await db.execute({
          sql: 'SELECT id, email, created_at FROM Users WHERE id = ?',
          args: params,
        });
        if (fallback.rows.length === 0) return null;
        return formatUser(fallback.rows[0]);
      }
      console.error('Error finding user by ID in Turso DB:', error.message);
      throw error;
    }
  }

  static async findAuthById(id) {
    const result = await db.execute({
      sql: 'SELECT * FROM Users WHERE id = ?',
      args: [id],
    });
    if (!result.rows.length) return null;
    return formatUser(result.rows[0], { includePhone: true, includePassword: true });
  }

  static async search({ q = '', limit = 50, offset = 0 } = {}) {
    const take = Math.min(100, Math.max(1, Number(limit) || 50));
    const skip = Math.max(0, Number(offset) || 0);
    let sql = `SELECT ${PUBLIC_COLUMNS} FROM Users`;
    const args = [];
    if (q && String(q).trim()) {
      sql += ' WHERE LOWER(email) LIKE ?';
      args.push(`%${String(q).trim().toLowerCase()}%`);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    args.push(take, skip);
    const result = await db.execute({ sql, args });
    return result.rows.map((row) => formatUser(row));
  }

  static async countAdmins() {
    const owners = require('../utils/adminRules').ownerEmails();
    let sql = "SELECT COUNT(*) AS c FROM Users WHERE role = 'admin'";
    const args = [];
    if (owners.length) {
      sql += ` OR LOWER(email) IN (${owners.map(() => '?').join(', ')})`;
      args.push(...owners);
    }
    const result = await db.execute({ sql, args });
    return Number(result.rows[0] && result.rows[0].c) || 0;
  }

  static async updateFields(id, fields) {
    const allowed = ['role', 'plan', 'is_banned', 'banned_at', 'ban_reason', 'phone', 'phone_verified'];
    const sets = [];
    const args = [];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        sets.push(`${key} = ?`);
        args.push(fields[key]);
      }
    }
    if (!sets.length) return this.findById(id);
    args.push(id);
    await db.execute({ sql: `UPDATE Users SET ${sets.join(', ')} WHERE id = ?`, args });
    return this.findById(id);
  }

  static async deleteById(id) {
    const result = await db.execute({ sql: 'DELETE FROM Users WHERE id = ?', args: [id] });
    return (result.rowsAffected || 0) > 0;
  }
}

module.exports = User;
module.exports.formatUser = formatUser;
