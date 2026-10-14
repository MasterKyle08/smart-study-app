const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url");
const privateFile = path.resolve(
  __dirname,
  "../../.local/compatibility-fixture-" +
    require("node:crypto").randomUUID() +
    ".sqlite",
);
// This fixture represents the deployed schema before this release. Never read .env.
Object.assign(process.env, {
  NODE_ENV: "development",
  LOCAL_DEVELOPMENT: "1",
  LOCAL_FREE_ONLY: "1",
  TURSO_DATABASE_URL: "file::memory:?cache=shared",
  TURSO_AUTH_TOKEN: "",
  LOCAL_STATE_DATABASE_URL: pathToFileURL(privateFile).href,
  JWT_SECRET: "local-fixture-signing-secret",
  GOOGLE_API_KEY: "",
  GOOGLE_FREE_API_KEY: "",
  GOOGLE_PREMIUM_API_KEY: "",
  GOOGLE_FREE_REQUEST_INTERVAL_MS: "0",
});
const anchor = require("@libsql/client").createClient({
  url: process.env.TURSO_DATABASE_URL,
});
const { db, init, close } = require("../models/db");
const User = require("../models/User");
const Session = require("../models/Session");
const Quiz = require("../models/PremadeQuiz");
const Review = require("../models/FlashcardReview");
const login = require("../services/loginSessions");
const localState = require("../services/localState");
let server, base;
test.before(async () => {
  await init(); // In-memory fixture only.
  await db.batch([
    "DROP TABLE AuthSessions",
    "DROP TABLE AccountTokens",
    "DROP TABLE AiMinuteReservations",
    "DROP TABLE AiMonthlySpend",
    "DROP TABLE AiRequestEvents",
    "ALTER TABLE Users DROP COLUMN session_version",
    "ALTER TABLE Sessions DROP COLUMN citations",
    "ALTER TABLE Sessions DROP COLUMN folder",
    "ALTER TABLE Sessions DROP COLUMN tags",
    "ALTER TABLE PremadeQuizzes DROP COLUMN folder",
    "ALTER TABLE FlashcardReviews DROP COLUMN definition",
  ]);
  server = require("../app").listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  (await localState.securityDB()).close();
  await close();
  anchor.close();
  for (const suffix of ["", "-wal", "-shm"])
    if (fs.existsSync(privateFile + suffix)) {
      try {
        fs.unlinkSync(privateFile + suffix);
      } catch (error) {
        if (error.code !== "EBUSY") throw error;
      }
    }
});
test("local login and logout use private state without migrating shared accounts", async () => {
  const user = await User.create("dummy-local@example.test", "test-only-hash");
  const token = await login.issue(user);
  const headers = { cookie: "ss_token=" + token };
  assert.equal((await fetch(base + "/api/auth/me", { headers })).status, 200);
  const devices = await (
    await fetch(base + "/api/account/sessions", { headers })
  ).json();
  assert.equal(devices.sessions.length, 1);
  for (const endpoint of ["recovery", "reset", "password"]) {
    assert.equal(
      (
        await fetch(base + "/api/account/" + endpoint, {
          method: "POST",
          headers,
        })
      ).status,
      503,
    );
  }
  assert.equal((await fetch(base + "/api/library", { headers })).status, 503);
  await fetch(base + "/api/auth/logout", { method: "POST", headers });
  assert.equal(await login.read(token), null);
  assert.equal(
    (
      await db.execute(
        "SELECT name FROM sqlite_master WHERE name='AuthSessions'",
      )
    ).rows.length,
    0,
  );
  assert.equal(await localState.hasColumn("Users", "session_version"), false);
  const reliability=await require('../services/aiTelemetry').dashboard();
  assert.equal(reliability.providerAttempts,0);
});
test("local saved materials and free admission work with the previous schema", async () => {
  const user = await User.create("dummy-study@example.test", "test-only-hash");
  const saved = await Session.create({
    userId: user.id,
    extractedText: "Real study input",
    summary: "Summary",
  });
  await Session.updateAiContent(saved.id, {
    summary: "Updated summary",
    citations: [],
  });
  const quiz = await Quiz.create({
    userId: user.id,
    title: "Fixture",
    slug: "fixture-local",
    quizJson: [],
  });
  assert.equal((await Quiz.listByUserId(user.id))[0].id, quiz.id);
  await Review.review({
    userId: user.id,
    sessionId: saved.id,
    cardKey: "Term",
    definition: "Answer",
    quality: 0,
  });
  const usage = require("../services/usage");
  const reservation = await usage.runWithContext({ user }, () =>
    usage.reserveProvider(100, 50, {
      premium: false,
      modelName: "gemma-local-fixture",
    }),
  );
  await usage.reconcileRequest(reservation, {
    usageMetadata: { promptTokenCount: 90, totalTokenCount: 120 },
  });
  await usage.releaseUnusedRequest(reservation);
  assert.equal(
    (
      await db.execute(
        "SELECT name FROM sqlite_master WHERE name='AiMinuteReservations'",
      )
    ).rows.length,
    0,
  );
});
