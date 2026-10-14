const fs = require("node:fs"),
  path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createClient } = require("@libsql/client");
const { db } = require("../models/db");
let privateState, ready, minuteClient;
function local() {
  return (
    process.env.LOCAL_DEVELOPMENT === "1" &&
    process.env.NODE_ENV !== "production"
  );
}
async function securityDB() {
  if (!local()) return db;
  if (!privateState) {
    const directory = path.resolve(__dirname, "../../.local");
    fs.mkdirSync(directory, { recursive: true });
    privateState = createClient({
      url:
        process.env.LOCAL_STATE_DATABASE_URL ||
        pathToFileURL(path.join(directory, "development-state.sqlite")).href,
    });
    ready = privateState.batch([
      "CREATE TABLE IF NOT EXISTS AuthSessions(id TEXT PRIMARY KEY,user_id INTEGER,version INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,expires_at INTEGER,last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,label TEXT,admin_generation INTEGER DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS AiMinuteReservations(id TEXT PRIMARY KEY,pool TEXT,model TEXT,tokens INTEGER,created_at INTEGER)",
    ]);
  }
  await ready;
  return privateState;
}
async function minuteDB() {
  if (!local()) return db;
  if (!minuteClient) {
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='AiMinuteReservations'",
    );
    minuteClient = result.rows.length ? db : await securityDB();
    if (minuteClient !== db)
      console.warn(
        "Local development: shared minute admission becomes coordinated with production after the next schema release. Local pacing is active in the meantime.",
      );
  }
  return minuteClient;
}
async function hasColumn(table, column) {
  if (!local()) return true;
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}
module.exports = { local, securityDB, minuteDB, hasColumn };
