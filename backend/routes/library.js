const router = require("express").Router();
const auth = require("../middleware/auth");
const { db } = require("../models/db");
const { page, metadata } = require("../utils/page");
router.use(auth);
router.use(async (req, res, next) => {
  try {
    const ready = await require("../services/localState").hasColumn(
      "Sessions",
      "folder",
    );
    if (!ready)
      return res
        .status(503)
        .json({
          message:
            "Library organization will be available locally after the next production schema release. Your existing uploads and quizzes still work.",
        });
    next();
  } catch (error) {
    next(error);
  }
});
router.get("/", async (req, res) => {
  try {
    const { limit } = page(req.query);
    const offset = require('../utils/page').offset(req.query.offset);
    const search = String(req.query.search || "")
        .trim()
        .slice(0, 200)
        .toLowerCase(),
      folder = String(req.query.folder || "").slice(0, 80);
    const sql = `SELECT * FROM (SELECT id,'session' AS kind,COALESCE(original_filename,'Untitled upload') AS title,folder,tags,created_at,NULL AS slug FROM Sessions WHERE user_id=? UNION ALL SELECT id,'quiz' AS kind,title,folder,tags,created_at,slug FROM PremadeQuizzes WHERE user_id=?) WHERE (?='' OR LOWER(title) LIKE ? OR LOWER(tags) LIKE ?) AND (?='' OR folder=?) ORDER BY created_at DESC,kind,id DESC LIMIT ? OFFSET ?`;
    const rows = (
      await db.execute({
        sql,
        args: [
          req.user.id,
          req.user.id,
          search,
          `%${search}%`,
          `%${search}%`,
          folder,
          folder,
          limit + 1,
          offset,
        ],
      })
    ).rows;
    const folders = (
      await db.execute({
        sql: "SELECT DISTINCT folder FROM (SELECT folder FROM Sessions WHERE user_id=? UNION SELECT folder FROM PremadeQuizzes WHERE user_id=?) WHERE folder<>'' ORDER BY folder LIMIT 100",
        args: [req.user.id, req.user.id],
      })
    ).rows.map((row) => row.folder);
    res.json({
      items: rows.slice(0, limit),
      nextOffset: rows.length > limit ? offset + limit : null,
      folders,
    });
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({
        message: error.statusCode ? error.message : "Could not load library.",
      });
  }
});
router.put("/:kind/:id", async (req, res) => {
  try {
    const table =
      req.params.kind === "session"
        ? "Sessions"
        : req.params.kind === "quiz"
          ? "PremadeQuizzes"
          : null;
    if (!table)
      throw Object.assign(new Error("Invalid material type."), {
        statusCode: 400,
      });
    const data = metadata(req.body);
    const result = await db.execute({
      sql: `UPDATE ${table} SET folder=?,tags=? WHERE id=? AND user_id=?`,
      args: [
        data.folder,
        JSON.stringify(data.tags),
        req.params.id,
        req.user.id,
      ],
    });
    if (!result.rowsAffected)
      throw Object.assign(new Error("Material not found."), {
        statusCode: 404,
      });
    res.json({ message: "Organization saved." });
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({
        message: error.statusCode
          ? error.message
          : "Could not save organization.",
      });
  }
});
module.exports = router;
