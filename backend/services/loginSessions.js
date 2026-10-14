const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { db } = require("../models/db");
const DAY = 86400000;
async function issue(user, label = "Browser") {
  const db = await require("./localState").securityDB();
  const id = crypto.randomBytes(32).toString("hex");
  const version = Number(user.session_version || 0);
  const expires = Date.now() + 7 * DAY;
  await db.execute({
    sql: "INSERT INTO AuthSessions(id,user_id,version,expires_at,label) VALUES (?,?,?,?,?)",
    args: [id, user.id, version, expires, String(label).slice(0, 100)],
  });
  return jwt.sign(
    { typ: "login", userId: Number(user.id), sid: id, version },
    process.env.JWT_SECRET,
    { expiresIn: "7d", algorithm: "HS256" },
  );
}
async function read(token) {
  if (!token) return null;
  const value = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
  });
  if (value.typ !== "login" || !value.sid) return null;
  const db = await require("./localState").securityDB();
  const result = await db.execute({
    sql: "SELECT id,version FROM AuthSessions WHERE id=? AND user_id=? AND expires_at>?",
    args: [value.sid, value.userId, Date.now()],
  });
  if (!result.rows.length) return null;
  const user = await require("../models/User").findById(value.userId);
  return user &&
    Number(value.version) === Number(result.rows[0].version) &&
    Number(result.rows[0].version) === Number(user.session_version || 0)
    ? { ...value, user }
    : null;
}
async function revoke(token) {
  const db = await require("./localState").securityDB();
  if (!token) return;
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return;
  }
  if (decoded.typ === "login" && decoded.sid)
    await db.execute({
      sql: "DELETE FROM AuthSessions WHERE id=? AND user_id=?",
      args: [decoded.sid, decoded.userId],
    });
}
async function revokeAll(userId, tx = db) {
  await tx.execute({
    sql: "UPDATE Users SET session_version=session_version+1 WHERE id=?",
    args: [userId],
  });
  await tx.execute({
    sql: "DELETE FROM AuthSessions WHERE user_id=?",
    args: [userId],
  });
}
module.exports = { issue, read, revoke, revokeAll };
