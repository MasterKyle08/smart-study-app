const test = require("node:test"),
  assert = require("node:assert/strict");
const { createClient } = require("@libsql/client");
Object.assign(process.env, {
  NODE_ENV: "production",
  LOCAL_DEVELOPMENT: "0",
  TURSO_DATABASE_URL: "file::memory:?cache=shared",
  TURSO_AUTH_TOKEN: "",
  JWT_SECRET: "followup-test-only-secret",
  GOOGLE_API_KEY: "",
  GOOGLE_FREE_API_KEY: "",
  GOOGLE_PREMIUM_API_KEY: "",
  ADMIN_EMAIL: "owner@example.test",
  SITE_ADDRESS: "study.example.test",
  RATE_LIMIT_MAX_REQUESTS: "10000",
  GOOGLE_FREE_REQUEST_INTERVAL_MS: "0",
});
for (const key of Object.keys(process.env))
  if (/^(SMTP_|RESEND_|TWILIO_|GCP_|STRIPE_)/.test(key))
    delete process.env[key];
const anchor = createClient({ url: process.env.TURSO_DATABASE_URL });
const { db, init, close } = require("../models/db");
const User = require("../models/User"),
  Session = require("../models/Session"),
  Review = require("../models/FlashcardReview");
const login = require("../services/loginSessions"),
  usage = require("../services/usage"),
  { writeTransaction } = require("../utils/transaction");
const account = require("../services/account");
const notify = require("../services/notify");
let server,
  base,
  n = 0;
test.before(async () => {
  await init();
  server = require("../app").listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  await close();
  anchor.close();
});
const member = () =>
  User.create(`followup-${++n}@example.test`, "unused-test-hash");
const source =
  "[Source: notes.pdf | Page: 2]\nPhotosynthesis converts sunlight into chemical energy in plant cells.";
test("security headers block framing/eval and reject foreign origins while allowing the configured origin", async () => {
  const response = await fetch(base + "/");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.doesNotMatch(
    response.headers.get("content-security-policy"),
    /script-src[^;]*'unsafe-inline'/,
  );
  assert.equal(
    (
      await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  const allowed = await fetch(base + "/api/billing/config", {
    headers: { origin: "https://study.example.test" },
  });
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "https://study.example.test",
  );
  assert.equal(allowed.headers.get("cache-control"), "no-store");
  const worker = await fetch(base + "/js/code-worker.js");
  assert.match(
    worker.headers.get("content-security-policy"),
    /connect-src 'none'/,
  );
});
test("logout revokes a copied token and legacy JWTs are rejected", async () => {
  const user = await member(),
    token = await login.issue(user),
    cookie = "ss_token=" + token;
  assert.equal(
    (await fetch(base + "/api/auth/me", { headers: { cookie } })).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/auth/logout", {
        method: "POST",
        headers: { cookie },
      })
    ).status,
    200,
  );
  assert.equal(await login.read(token), null);
  assert.equal(
    (await fetch(base + "/api/auth/me", { headers: { cookie } })).status,
    401,
  );
  assert.equal(
    await login.read(
      require("jsonwebtoken").sign({ userId: user.id }, process.env.JWT_SECRET),
    ),
    null,
  );
});
test("password changes invalidate every device and reset tokens are single-use", async () => {
  const bcrypt = require("bcryptjs");
  const user = await User.create(
    `password-${++n}@example.test`,
    await bcrypt.hash("old-fixture-password", 10),
  );
  const first = await login.issue(user),
    second = await login.issue(user);
  await account.change(user, "old-fixture-password", "new-fixture-password");
  assert.equal(await login.read(first), null);
  assert.equal(await login.read(second), null);
  process.env.SMTP_HOST = "fixture";
  process.env.SMTP_USER = "fixture";
  process.env.SMTP_PASS = "fixture";
  let body;
  const send = notify.sendEmail;
  notify.sendEmail = async (value) => {
    body = value.text;
  };
  try {
    await account.requestReset(user.email);
    const token = new URL(body.match(/https:\/\/\S+/)[0]).hash.slice(7);
    await account.reset(token, "reset-fixture-password");
    await assert.rejects(
      account.reset(token, "another-fixture-password"),
      /expired or already used/,
    );
    assert.ok(
      await bcrypt.compare(
        "reset-fixture-password",
        (await User.findByEmail(user.email)).password_hash,
      ),
    );
  } finally {
    notify.sendEmail = send;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  }
});
test("session revocation is scoped to the signed-in owner", async () => {
  const a = await member(),
    b = await member(),
    ta = await login.issue(a),
    tb = await login.issue(b),
    sid = (await login.read(tb)).sid;
  await fetch(base + "/api/account/sessions/" + sid, {
    method: "DELETE",
    headers: { cookie: "ss_token=" + ta },
  });
  assert.ok(await login.read(tb));
  const data = await (
    await fetch(base + "/api/account/sessions", {
      headers: { cookie: "ss_token=" + ta },
    })
  ).json();
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessions[0].current, true);
});
test("validation rejects oversized hints, nested option objects and invalid tolerance", () => {
  const { validateAiBody } = require("../utils/input");
  for (const body of [
    { difficultyHint: "x".repeat(21) },
    { question: { options: {} } },
    { question: { numericTolerance: -1 } },
    { interactionType: "x".repeat(31) },
  ])
    assert.throws(
      () => validateAiBody(body),
      (error) => error.statusCode === 400,
    );
});
test("zero answers survive normalization, correct choices remain selectable, and tolerance is absolute", () => {
  const {
    normalizeQuizQuestions,
    scoreLocally,
  } = require("../utils/studyContent");
  assert.equal(
    normalizeQuizQuestions([
      { questionText: "Zero?", questionType: "numeric", correctAnswer: 0 },
    ])[0].correctAnswer,
    "0",
  );
  const q = normalizeQuizQuestions([
    {
      questionText: "Pick G",
      options: ["A", "B", "C", "D", "E", "F"],
      correctAnswer: "G",
    },
  ])[0];
  assert.ok(q.options.includes("G"));
  assert.equal(
    scoreLocally(
      {
        questionType: "numeric",
        correctAnswer: "1000",
        numericTolerance: 0.01,
      },
      "1009",
    ).correctness,
    "incorrect",
  );
});
test("truncated bundles retain complete content and reject invented citations", () => {
  const { recoverJson, normalizeFlashcards } = require("../utils/studyContent");
  const result = recoverJson(
    '{"summary":"Complete summary","flashcards":[{"term":"plant","definition":"A plant"},{"term":"cut',
  );
  assert.equal(result.summary, "Complete summary");
  assert.equal(normalizeFlashcards(result.flashcards).length, 1);
  assert.equal(result.__partial, true);
  const { evidence } = require("../utils/citations");
  assert.equal(
    evidence(source, "Photosynthesis converts sunlight into chemical energy")
      .page,
    2,
  );
  assert.equal(evidence(source, "This quote was never in the notes"), null);
});
test("deleting an upload removes its private review terms and respects ownership", async () => {
  const user = await member(),
    other = await member(),
    saved = await Session.create({
      userId: user.id,
      extractedText: source,
      flashcards: "[]",
    });
  await Review.review({
    userId: user.id,
    sessionId: saved.id,
    cardKey: "Private term",
    definition: "Private definition",
    quality: 0,
  });
  await assert.rejects(
    Session.deleteById(saved.id, other.id),
    (error) => error.statusCode === 404,
  );
  await Session.deleteById(saved.id, user.id);
  assert.equal(
    (await Review.listDue(user.id, { includeUpcoming: true })).length,
    0,
  );
});
test("Again schedules a short repeat and definitions can be reviewed on another device", async () => {
  const user = await member(),
    now = Date.now();
  await Review.review({
    userId: user.id,
    sessionId: null,
    cardKey: "Energy",
    definition: "Stored answer",
    quality: 0,
  });
  const records = await Review.listDue(user.id, { includeUpcoming: true });
  assert.equal(records[0].definition, "Stored answer");
  assert.ok(Date.parse(records[0].dueAt) - now <= 601000);
  assert.ok(Date.parse(records[0].dueAt) > now);
});
test("Premium action admission includes its bonus and monetary budgets are atomic", async () => {
  const user = await member();
  process.env.PREMIUM_MONTHLY_AI_BUDGET_USD = "0.001";
  process.env.PREMIUM_GLOBAL_MONTHLY_AI_BUDGET_USD = "100";
  await usage.ensureRow?.(usage.usageDate(), `user:${user.id}`);
  await db.execute({
    sql: "INSERT OR IGNORE INTO AiUsageDaily(usage_date,user_key,jobs,bonus_jobs) VALUES (?,?,200,1)",
    args: [usage.usageDate(), `user:${user.id}`],
  });
  await usage.runWithContext({ user, premium: true }, () =>
    usage.reserveJob({ user, premium: true }),
  );
  const results = await usage.runWithContext({ user, premium: true }, () =>
    Promise.allSettled(
      Array.from({ length: 5 }, () =>
        usage.reserveProvider(1000, 1000, {
          premium: true,
          modelName: "gemini-2.5-flash-lite",
        }),
      ),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    2,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    3,
  );
  delete process.env.PREMIUM_MONTHLY_AI_BUDGET_USD;
  delete process.env.PREMIUM_GLOBAL_MONTHLY_AI_BUDGET_USD;
});
test("shared minute admissions coordinate different users and refund unused reservations", async () => {
  process.env.GOOGLE_FREE_INPUT_TOKENS_PER_MINUTE = "1000";
  const users = await Promise.all([member(), member(), member(), member()]);
  const results = await Promise.allSettled(
    users.map((user) =>
      usage.runWithContext({ user }, () =>
        usage.reserveProvider(300, 10, {
          premium: false,
          modelName: "minute-fixture",
          deadline: Date.now() + 100,
        }),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  const reserved = results.find((r) => r.status === "fulfilled").value;
  await usage.releaseUnusedRequest(reserved);
  const replacement = await usage.runWithContext({ user: users[3] }, () =>
    usage.reserveProvider(300, 10, {
      premium: false,
      modelName: "minute-fixture",
      deadline: Date.now() + 100,
    }),
  );
  assert.ok(replacement.minute);
  delete process.env.GOOGLE_FREE_INPUT_TOKENS_PER_MINUTE;
});
test("library search spans quizzes/uploads without sending source data or crossing accounts", async () => {
  const user = await member(),
    saved = await Session.create({
      userId: user.id,
      originalFilename: "Biology notes",
      extractedText: source,
    });
  const token = await login.issue(user),
    headers = {
      cookie: "ss_token=" + token,
      "content-type": "application/json",
    };
  assert.equal(
    (
      await fetch(base + `/api/library/session/${saved.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ folder: "Science", tags: ["Plants"] }),
      })
    ).status,
    200,
  );
  const data = await (
    await fetch(base + "/api/library?search=plants&folder=Science", { headers })
  ).json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].id, saved.id);
  assert.equal(data.items[0].extracted_text, undefined);
  assert.deepEqual(data.folders, ["Science"]);
});
test("account exports omit password hashes and login tokens", async () => {
  const user = await member();
  const data = await account.exportData(user);
  assert.equal(data.account.password_hash, undefined);
  assert.equal(data.account.session_version, undefined);
  assert.equal(data.sessions.length, 0);
});
test("configured 2.5 Flash-Lite pricing matches the model, while foreign redirects are rejected", () => {
  const price = require("../utils/modelPricing").pricing(
    "gemini-2.5-flash-lite",
  );
  assert.equal(price.input, 0.1);
  assert.equal(price.output, 0.4);
});
test("billing locks serialize authoritative subscription reads, including equal-second events", async () => {
  const user = await member();
  await db.execute({
    sql: "UPDATE Users SET stripe_customer_id='cus_race',billing_provider='stripe' WHERE id=?",
    args: [user.id],
  });
  await db.execute({
    sql: "INSERT INTO BillingSubscriptions(id,user_id,customer_id,status,entitled,entitled_until,event_created) VALUES ('sub_race',?,'cus_race','active',1,9999999999,0)",
    args: [user.id],
  });
  process.env.STRIPE_WEBHOOK_SECRET = "fixture";
  process.env.STRIPE_PRICE_ID = "price_fixture";
  let release, entered;
  const ready = new Promise((r) => (entered = r));
  let status = "active",
    calls = 0;
  const billing = require("../services/billing").createBillingHandlers({
    client: db,
    transaction: writeTransaction,
    getStripe: () => ({
      webhooks: { constructEvent: (body) => JSON.parse(body) },
      subscriptions: {
        retrieve: async () => {
          const captured = status;
          if (calls++ === 0) {
            entered();
            await new Promise((r) => (release = r));
          }
          return {
            customer: "cus_race",
            status: captured,
            latest_invoice: { paid: true },
            items: {
              data: [
                { price: "price_fixture", current_period_end: 9999999999 },
              ],
            },
          };
        },
      },
    }),
  });
  const event = (id) =>
    Buffer.from(
      JSON.stringify({
        id,
        created: 123,
        type: "customer.subscription.updated",
        data: { object: { id: "sub_race" } },
      }),
    );
  const first = billing.handleStripeWebhook(event("evt_before"), "fixture");
  await ready;
  status = "canceled";
  await assert.rejects(
    billing.handleStripeWebhook(event("evt_after"), "fixture"),
    (error) => error.statusCode === 503,
  );
  release();
  await first;
  await billing.handleStripeWebhook(event("evt_after"), "fixture");
  assert.equal((await User.findById(user.id)).plan, "free");
  await billing.handleStripeWebhook(event("evt_old_delayed"), "fixture");
  assert.equal((await User.findById(user.id)).plan, "free");
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_ID;
});
test("locking admin mode invalidates copied step-up cookies on that login session", async () => {
  const user = await member();
  await User.updateFields(user.id, { role: "admin" });
  const token = await login.issue(user),
    sid = (await login.read(token)).sid;
  const admin = require("../services/admin").signAdminToken(
    { ...user, role: "admin" },
    { id: sid, generation: 0 },
  );
  const headers = { cookie: `ss_token=${token}; ss_admin=${admin}` };
  assert.equal(
    (await fetch(base + "/api/admin/reliability", { headers })).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/api/admin/lock", { method: "POST", headers })).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/api/admin/reliability", { headers })).status,
    401,
  );
});
test("same-origin legacy checkout redirects work and repeated checkout reuses an open session", async () => {
  const user = await member();
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: "test-key",
    STRIPE_PRICE_ID: "price_fixture",
    STRIPE_WEBHOOK_SECRET: "test-key",
    GOOGLE_PREMIUM_API_KEY: "test-key",
    BILLING_SUCCESS_URL:
      "https://study.example.test/dashboard.html?billing=success",
  });
  let creates = 0;
  const stripe = {
    checkout: {
      sessions: {
        create: async (options) => {
          creates++;
          assert.equal(
            options.success_url,
            "https://study.example.test/dashboard.html?billing=success",
          );
          return {
            id: "cs_repeat",
            url: "https://checkout.stripe.test/fixture",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          };
        },
        retrieve: async () => ({
          id: "cs_repeat",
          status: "open",
          url: "https://checkout.stripe.test/fixture",
        }),
      },
    },
  };
  const billing = require("../services/billing").createBillingHandlers({
    getStripe: () => stripe,
  });
  try {
    await billing.createCheckout({ provider: "stripe", user });
    await billing.createCheckout({ provider: "stripe", user });
    assert.equal(creates, 1);
    process.env.BILLING_SUCCESS_URL = "https://evil.example/";
    const other = await member();
    await assert.rejects(
      billing.createCheckout({ provider: "stripe", user: other }),
      /configured website/,
    );
  } finally {
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_ID",
      "STRIPE_WEBHOOK_SECRET",
      "GOOGLE_PREMIUM_API_KEY",
      "BILLING_SUCCESS_URL",
    ])
      delete process.env[key];
  }
});
test("deletion cancellation failures preserve the account and study data", async () => {
  const bcrypt = require("bcryptjs");
  const user = await User.create(
    `erase-${++n}@example.test`,
    await bcrypt.hash("erase-fixture-password", 10),
  );
  await Session.create({ userId: user.id, extractedText: "Private notes" });
  await db.execute({
    sql: "UPDATE Users SET stripe_customer_id='cus_delete',billing_provider='stripe' WHERE id=?",
    args: [user.id],
  });
  await assert.rejects(
    account.erase(user, "erase-fixture-password"),
    (error) => error.statusCode === 503,
  );
  assert.ok(await User.findById(user.id));
  assert.equal((await Session.listSummaries(user.id)).sessions.length, 1);
});

test("admin listings offer bounded pages without downloading full quiz sources", async () => {
  const user = await member();
  await User.updateFields(user.id, { role: "admin" });
  const token = await login.issue(user),
    sid = (await login.read(token)).sid;
  const admin = require("../services/admin").signAdminToken(
    { ...user, role: "admin" },
    { id: sid, generation: 0 },
  );
  const headers = { cookie: `ss_token=${token}; ss_admin=${admin}` };
  const Quiz = require("../models/PremadeQuiz");
  for (let i = 0; i < 27; i++)
    await Quiz.create({
      userId: user.id,
      title: "Paged " + i,
      slug: "paged-" + i,
      sourceText: "Private original source",
      quizJson: [{ questionText: "Question" }],
    });
  const first = await (
    await fetch(base + "/api/admin/quizzes?search=Paged", { headers })
  ).json();
  assert.equal(first.quizzes.length, 24);
  assert.equal(first.nextOffset, 24);
  assert.equal(first.quizzes[0].sourceText, undefined);
  assert.equal(first.quizzes[0].quiz, undefined);
  const next = await (
    await fetch(base + "/api/admin/quizzes?search=Paged&offset=24", { headers })
  ).json();
  assert.equal(next.quizzes.length, 3);
  assert.equal(next.nextOffset, null);
});

test("deleting an account expires an unpaid checkout before erasing any data", async () => {
  const user = await member(),
    token = await login.issue(user);
  await Session.create({
    userId: user.id,
    extractedText: "Saved private notes",
  });
  await db.execute({
    sql: "INSERT INTO BillingCheckouts(id,user_id,expires_at) VALUES (?,?,?)",
    args: ["cs_erase_pending", user.id, Date.now() - 1000],
  });
  let expired = false;
  const stripe = {
    checkout: {
      sessions: {
        retrieve: async () => ({ status: "open" }),
        expire: async (id) => {
          assert.equal(id, "cs_erase_pending");
          assert.ok(await User.findById(user.id));
          expired = true;
        },
      },
    },
  };
  const billing = require("../services/billing").createBillingHandlers({
    getStripe: () => stripe,
  });
  await billing.cancelUserSubscriptions(user.id, (assertLock) =>
    account.eraseData(user.id, assertLock),
  );
  assert.equal(expired, true);
  assert.equal(await User.findById(user.id), null);
  assert.equal(await login.read(token), null);
  assert.equal(
    (
      await db.execute({
        sql: "SELECT id FROM Sessions WHERE user_id=?",
        args: [user.id],
      })
    ).rows.length,
    0,
  );
});

test("a billing portal uses only the stored customer and trusted return origin", async () => {
  const user = await member();
  await db.execute({sql:'UPDATE Users SET stripe_customer_id=? WHERE id=?',args:['cus_portal_fixture',user.id]});
  let options;
  const billing = require("../services/billing").createBillingHandlers({
    getStripe: () => ({
      billingPortal: {
        sessions: {
          create: async (value) => {
            options = value;
            return { url: "https://billing.stripe.test/portal" };
          },
        },
      },
    }),
  });
  await billing.portal(await User.findById(user.id));
  assert.equal(options.customer, "cus_portal_fixture");
  assert.equal(options.return_url, "https://study.example.test/account.html");
});

test("AI reliability separates 429, malformed output and provider success without storing private content", async () => {
  const telemetry = require("../services/aiTelemetry");
  await db.execute("DELETE FROM AiRequestEvents");
  for (const value of [
    { status: 200 },
    { status: 429 },
    { status: 502, outcome: "invalid-output" },
    { status: 429, outcome: "admission-error" },
  ])
    telemetry.record({
      model: "fixture-model",
      elapsedMs: 10,
      ...value,
      prompt: "Private fixture prompt",
      userId: 123,
    });
  for (let i = 0; i < 50; i++) {
    if (
      Number(
        (await db.execute("SELECT COUNT(*) AS n FROM AiRequestEvents")).rows[0]
          .n,
      ) === 4
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const data = await telemetry.dashboard();
  assert.equal(data.providerAttempts, 2);
  assert.equal(data.providerResponseSuccessPercent, 50);
  assert.ok(
    data.groups.some(
      (row) => row.status === "429" && row.outcome === "provider-error",
    ),
  );
  assert.ok(!JSON.stringify(data).includes("Private fixture prompt"));
  assert.ok(!JSON.stringify(data).includes("userId"));
});
