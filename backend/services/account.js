const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { db } = require("../models/db");
const User = require("../models/User");
const sessions = require("./loginSessions");
const notify = require("./notify");
const { writeTransaction } = require("../utils/transaction");
const { normalizeEmail } = require("../utils/identity");
function password(value) {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    Buffer.byteLength(value) > 72
  )
    throw Object.assign(
      new Error(
        "Use a passphrase of at least 12 characters and at most 72 bytes.",
      ),
      { statusCode: 400 },
    );
  return value;
}
function origin() {
  return new URL(
    process.env.PUBLIC_ORIGIN || `https://${process.env.SITE_ADDRESS}`,
  ).origin;
}
async function requestReset(email) {
  email = normalizeEmail(email);
  if (!notify.emailConfigured())
    throw Object.assign(
      new Error(
        "Password recovery email is not configured. Contact the site owner.",
      ),
      { statusCode: 503 },
    );
  const user = await User.findByEmail(email);
  if (!user || user.isBanned) return;
  const token = crypto.randomBytes(32).toString("base64url");
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const created = await writeTransaction(async (tx) => {
    const recent = await tx.execute({
      sql: "SELECT digest FROM AccountTokens WHERE user_id=? AND purpose='reset' AND created_at>datetime('now','-1 minute')",
      args: [user.id],
    });
    if (recent.rows.length) return false;
    await tx.execute({
      sql: "DELETE FROM AccountTokens WHERE user_id=? AND purpose='reset'",
      args: [user.id],
    });
    await tx.execute({
      sql: "INSERT INTO AccountTokens(digest,user_id,purpose,expires_at) VALUES (?,?,'reset',?)",
      args: [digest, user.id, Date.now() + 1800000],
    });
    return true;
  });
  if (created)
    await notify.sendEmail({
      to: user.email,
      subject: "Reset your Smart Study password",
      text: `Use this link within 30 minutes: ${origin()}/account.html#reset=${token}\nIf you did not request this, ignore this email.`,
    });
}
async function reset(token, newPassword) {
  password(newPassword);
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw Object.assign(new Error("Invalid recovery link."), {
      statusCode: 400,
    });
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const hash = await bcrypt.hash(newPassword, 10);
  await writeTransaction(async (tx) => {
    const found = await tx.execute({
      sql: "DELETE FROM AccountTokens WHERE digest=? AND purpose='reset' AND expires_at>? RETURNING user_id",
      args: [digest, Date.now()],
    });
    if (!found.rows.length)
      throw Object.assign(new Error("Recovery link expired or already used."), {
        statusCode: 400,
      });
    const id = found.rows[0].user_id;
    await tx.execute({
      sql: "UPDATE Users SET password_hash=? WHERE id=?",
      args: [hash, id],
    });
    await sessions.revokeAll(id, tx);
  });
}
async function change(user, current, next) {
  password(next);
  const original = await User.findAuthById(user.id);
  if (
    typeof current !== "string" ||
    Buffer.byteLength(current) > 1024 ||
    !(await bcrypt.compare(current, original.password_hash))
  )
    throw Object.assign(new Error("Current password is incorrect."), {
      statusCode: 400,
    });
  const hash = await bcrypt.hash(next, 10);
  await writeTransaction(async (tx) => {
    await tx.execute({
      sql: "UPDATE Users SET password_hash=? WHERE id=?",
      args: [hash, user.id],
    });
    await sessions.revokeAll(user.id, tx);
    await tx.execute({
      sql: "DELETE FROM AccountTokens WHERE user_id=?",
      args: [user.id],
    });
  });
}
async function exportData(user) {
  const study = await db.execute({
    sql: "SELECT * FROM Sessions WHERE user_id=? ORDER BY id",
    args: [user.id],
  });
  const quizzes = await db.execute({
    sql: "SELECT * FROM PremadeQuizzes WHERE user_id=? ORDER BY id",
    args: [user.id],
  });
  const reviews = await db.execute({
    sql: "SELECT * FROM FlashcardReviews WHERE user_id=?",
    args: [user.id],
  });
  return {
    format: "smart-study-account-v1",
    exportedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: user.created_at },
    sessions: study.rows,
    quizzes: quizzes.rows,
    reviews: reviews.rows,
  };
}
async function erase(user, passwordValue) {
  if (user.isOwner)
    throw Object.assign(
      new Error(
        "The owner account must be transferred by the server operator before deletion.",
      ),
      { statusCode: 400 },
    );
  const auth = await User.findAuthById(user.id);
  if (
    typeof passwordValue !== "string" ||
    Buffer.byteLength(passwordValue) > 1024 ||
    !(await bcrypt.compare(passwordValue, auth.password_hash))
  )
    throw Object.assign(new Error("Password is incorrect."), {
      statusCode: 400,
    });
  await require("./billing").cancelUserSubscriptions(user.id, (assertLock) =>
    eraseData(user.id, assertLock),
  );
}
async function eraseData(id, assertLock) {
  await writeTransaction(async (tx) => {
    if (assertLock) await assertLock(tx);
    for (const table of [
      "FlashcardReviews",
      "Sessions",
      "PremadeQuizzes",
      "AuthSessions",
      "AccountTokens",
      "AdminOtps",
      "BillingCheckouts",
      "BillingSubscriptions",
    ])
      await tx.execute({
        sql: `DELETE FROM ${table} WHERE user_id=?`,
        args: [id],
      });
    for (const table of ["AiUsageDaily", "AiMonthlySpend"])
      await tx.execute({
        sql: `DELETE FROM ${table} WHERE user_key=?`,
        args: [`user:${id}`],
      });
    await tx.execute({ sql: "DELETE FROM Users WHERE id=?", args: [id] });
  });
}
module.exports = { requestReset, reset, change, exportData, erase, eraseData };
