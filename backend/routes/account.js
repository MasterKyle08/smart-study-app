const express = require("express");
const auth = require("../middleware/auth");
const rateLimit = require("express-rate-limit");
const account = require("../services/account");
const { db } = require("../models/db");
const { clearAuthCookie } = require("../utils/cookies");
const router = express.Router();
const localState = require("../services/localState");
const sharedAccountMutation = (req, res, next) =>
  localState.local()
    ? res
        .status(503)
        .json({
          message:
            "Use the live website for password recovery, password changes, or account deletion. Local development shares its accounts and must not change production security settings.",
        })
    : next();
const recoveryLimit = rateLimit({
  windowMs: 900000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const route = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({
        message: error.statusCode
          ? error.message
          : "Account action failed. Try again.",
      });
  }
};
router.post(
  "/recovery",
  sharedAccountMutation,
  recoveryLimit,
  route(async (req, res) => {
    await account.requestReset(req.body.email);
    res.json({
      message:
        "If this address has an account, a recovery link will be emailed.",
    });
  }),
);
router.post(
  "/reset",
  sharedAccountMutation,
  recoveryLimit,
  route(async (req, res) => {
    await account.reset(req.body.token, req.body.password);
    clearAuthCookie(res);
    res.json({ message: "Password updated. Sign in again." });
  }),
);
router.use(auth);
const stepUp = (req, res, next) =>
  req.user.isAdmin ? auth.requireAdminSession(req, res, next) : next();
router.get(
  "/sessions",
  route(async (req, res) => {
    const result = await (
      await localState.securityDB()
    ).execute({
      sql: "SELECT id,label,created_at,expires_at FROM AuthSessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 50",
      args: [req.user.id, Date.now()],
    });
    res.json({
      sessions: result.rows.map((row) => ({
        ...row,
        current: row.id === req.loginSession.sid,
      })),
    });
  }),
);
router.delete(
  "/sessions/:id",
  route(async (req, res) => {
    await (
      await localState.securityDB()
    ).execute({
      sql: "DELETE FROM AuthSessions WHERE id=? AND user_id=?",
      args: [req.params.id, req.user.id],
    });
    if (req.params.id === req.loginSession.sid) clearAuthCookie(res);
    res.json({ message: "Session revoked." });
  }),
);
router.post(
  "/password",
  sharedAccountMutation,
  stepUp,
  route(async (req, res) => {
    await account.change(req.user, req.body.currentPassword, req.body.password);
    clearAuthCookie(res);
    res.json({ message: "Password updated. All devices signed out." });
  }),
);
router.get(
  "/export",
  stepUp,
  route(async (req, res) => {
    res.set(
      "Content-Disposition",
      'attachment; filename="smart-study-account.json"',
    );
    res.json(await account.exportData(req.user));
  }),
);
router.delete(
  "/",
  sharedAccountMutation,
  stepUp,
  route(async (req, res) => {
    if (req.body.confirm !== req.user.email)
      throw Object.assign(
        new Error("Type your email to confirm account deletion."),
        { statusCode: 400 },
      );
    await account.erase(req.user, req.body.password);
    clearAuthCookie(res);
    res.json({ message: "Account deleted and subscriptions cancelled." });
  }),
);
module.exports = router;
