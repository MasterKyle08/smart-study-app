const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { contrast } = require("./contrast");
const question = {
  id: "q1",
  questionText: "Which term describes plant energy conversion?",
  questionType: "multiple_choice",
  options: ["Photosynthesis", "Respiration"],
  correctAnswer: "Photosynthesis",
  briefExplanation: "Plants convert light energy.",
};
const cards = [
  { term: "First card", definition: "First answer" },
  { term: "Second card", definition: "Second answer" },
];
const session = {
  id: 1,
  original_filename: "Plant notes",
  created_at: "2026-10-14T12:00:00Z",
  updated_at: "2026-10-14T12:00:00Z",
  summary: "Plant notes summary.",
  flashcards: cards,
  quiz: [question],
  extracted_text: "Photosynthesis converts sunlight into chemical energy.",
  citations: [
    {
      kind: "summary",
      related: true,
      file: "plant.pdf",
      page: 2,
      quote: "Photosynthesis converts sunlight into chemical energy.",
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body = {};
    if (url.pathname === "/api/auth/me")
      body = {
        user: {
          id: 9999,
          email: "dummy@local.test",
          plan: "free",
          isAdmin: false,
        },
      };
    else if (url.pathname === "/api/usage/status")
      body = {
        community: {
          gemmaUsed: 0,
          gemmaBudget: 1500,
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
        },
        you: { jobsUsed: 0, jobsLimit: 24, jobsRemaining: 24, plan: "free" },
      };
    else if (url.pathname === "/api/billing/config")
      body = { premiumEnabled: false, providers: {}, ads: { enabled: false } };
    else if (url.pathname === "/api/study/sessions")
      body = { sessions: [session], nextCursor: null };
    else if (url.pathname === "/api/study/sessions/1") body = { session };
    else if (url.pathname === "/api/study/flashcard-reviews")
      body = {
        reviews: [
          {
            id: 3,
            sessionId: 1,
            term: "Due card",
            definition: "Saved due answer",
            dueAt: "2020-01-01T00:00:00Z",
          },
        ],
      };
    else if (url.pathname === "/api/study/flashcard-review")
      body = { review: { dueAt: "2030-01-01T00:00:00Z", repetitions: 1 } };
    else if (url.pathname === "/api/account/sessions")
      body = {
        sessions: [
          {
            id: "fixture-session",
            label: "Browser",
            created_at: "2026-10-14",
            current: true,
          },
        ],
      };
    else if (url.pathname === "/api/account/export")
      body = {
        format: "smart-study-account-v1",
        account: { email: "dummy@local.test" },
        sessions: [session],
      };
    else if (url.pathname === "/api/library")
      body = {
        items: [
          {
            id: 1,
            kind: "session",
            title: "Plant notes",
            folder: "Science",
            tags: '["plants"]',
          },
        ],
        folders: ["Science"],
        nextOffset: null,
      };
    else if (url.pathname === "/api/study/practice")
      body = { quiz: [question] };
    return route.fulfill({ json: body });
  });
  fs.mkdirSync(".local/artifacts", { recursive: true });
});
test("Copy works asynchronously under CSP and announces completion", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => {} },
      configurable: true,
    });
    window.displayResults({ summary: "Fixture summary", warnings: [] });
  });
  const button = page.locator('.copy-button[data-target="summaryOutput"]');
  await button.click();
  await expect(button).toHaveText("Copied!");
});
test("the isolated runner terminates infinite loops and the page stays responsive", async ({
  page,
}) => {
  await page.goto("/practice");
  await page.evaluate(() => {
    window.currentQuizData = [
      {
        questionType: "coding_trace",
        language: "javascript",
        codeSnippet: "while(true){}",
      },
    ];
    const out = document.createElement("pre");
    out.id = "codeRunnerOutput";
    document.body.append(out);
    window.runQuizCodeSnippet();
  });
  await expect(page.locator("#codeRunnerOutput")).toHaveText("Timed out.");
  await expect(page.locator("#practiceGenerateBtn")).toBeEnabled();
});
test("grading failures leave the answer retryable rather than changing the score", async ({
  page,
}) => {
  await page.route("**/api/study/quiz-answer-feedback", (route) =>
    route.fulfill({ status: 503, json: { message: "Provider unavailable" } }),
  );
  await page.goto("/practice");
  await page.locator("#practiceTopic").fill("Plants");
  await page.locator("#practiceGenerateBtn").click();
  await page.locator('input[name="quizOption"]').first().check();
  await page.getByRole("button", { name: "Check Answer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check Answer", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.quizQuestionStates[0])).toBe(
    "unanswered",
  );
});
test("late feedback stays with its original card after navigation", async ({
  page,
}) => {
  let release;
  const pending = new Promise((r) => (release = r));
  await page.route("**/api/study/flashcard-interact", async (route) => {
    await pending;
    await route.fulfill({
      json: {
        feedback: "Feedback only for first card",
        correctness: "correct",
      },
    });
  });
  await page.goto("/");
  await page.evaluate(
    (value) => window.displayResults({ flashcards: value, warnings: [] }),
    cards,
  );
  await page
    .getByRole("button", { name: "Study Flashcards", exact: false })
    .click();
  await page.locator("#flashcardUserAnswer-main").fill("First answer");
  await page.locator("#submitFlashcardAnswerBtn-main").click();
  await page.locator("#nextFlashcardBtn-main").click();
  release();
  await expect(page.locator("#flashcardModalContent-main")).not.toContainText(
    "Feedback only for first card",
  );
  await page.locator("#prevFlashcardBtn-main").click();
  await expect(page.locator("#flashcardModalContent-main")).toContainText(
    "Feedback only for first card",
  );
});
test("retrying a missed subset preserves question identity on another retry", async ({
  page,
}) => {
  await page.goto("/practice");
  expect(
    await page.evaluate(() => {
      window.originalFullQuizData = [
        { id: "q1", questionText: "First", questionType: "short_answer" },
        { id: "q2", questionText: "Second", questionType: "short_answer" },
      ];
      window.currentQuizData = window.originalFullQuizData;
      window.quizQuestionStates = ["correct", "incorrect"];
      window.retryIncorrectQuestions();
      window.quizQuestionStates = ["incorrect"];
      window.retryIncorrectQuestions();
      return window.currentQuizData.map((q) => q.id);
    }),
  ).toEqual(["q2"]);
});
test("practice follow-up actions regenerate from the practice form", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/study/practice", (route) => {
    calls++;
    return route.fulfill({ json: { quiz: [question] } });
  });
  await page.goto("/practice");
  await page.locator("#practiceTopic").fill("Plants");
  await page.locator("#practiceGenerateBtn").click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "New Quiz (Same Settings)" }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator("#quizInterfaceContainer")).toBeVisible();
});
test("long chats send bounded histories and omit UI state from question prompts", async ({
  page,
}) => {
  let body;
  await page.route("**/api/study/quiz-chat", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ json: { chatResponse: "Fixture reply" } });
  });
  await page.goto("/practice");
  await page.evaluate(async () => {
    const q = {
      id: "q1",
      questionText: "Question",
      questionType: "short_answer",
      correctAnswer: "Answer",
      chatHistory: Array.from({ length: 40 }, (_, i) => ({
        role: i % 2 ? "model" : "user",
        parts: [{ text: "Message " + i }],
      })),
    };
    await apiChatAboutQuizQuestion(q, q.chatHistory, "Follow up");
  });
  expect(body.chatHistory.length).toBeLessThanOrEqual(8);
  expect(body.question.chatHistory).toBeUndefined();
});
test("Due Today opens stored definitions and synchronizes a rating", async ({
  page,
}) => {
  let sent;
  await page.route("**/api/study/flashcard-review", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      json: { review: { dueAt: "2030-01-01T00:00:00Z" } },
    });
  });
  await page.goto("/dashboard");
  await page.locator("#studyDueButton").click();
  await expect(page.locator("#flashcardModalContent-modal")).toContainText(
    "Due card",
  );
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  await page.getByRole("button", { name: "Again", exact: true }).click();
  await expect.poll(() => sent?.sessionId).toBe(1);
  expect(sent.card.definition).toBe("Saved due answer");
});
test("exports escape spreadsheet formulas and produce Anki and JSON downloads", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "View Details" }).click();
  const result = await page.evaluate(() => ({
    csv: window.StudyExports.csv([
      { term: '=HYPERLINK("bad")', definition: "A, B" },
    ]),
    anki: window.StudyExports.anki([
      { term: "<b>term</b>", definition: "answer" },
    ]),
  }));
  expect(result.csv).toContain("'=HYPERLINK");
  expect(result.anki).toContain("&lt;b&gt;term&lt;/b&gt;");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Study set JSON" }).click();
  expect((await download).suggestedFilename()).toBe("study-set.json");
});
test("source evidence shows verified page/quote information", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "View Details" }).click();
  await page.getByText("Supporting source excerpts").click();
  await expect(page.locator(".source-evidence")).toContainText("page 2");
  await expect(page.locator(".source-evidence")).toContainText(
    "Photosynthesis converts sunlight",
  );
});
test("library search and organization use authenticated metadata APIs", async ({
  page,
}) => {
  let saved;
  await page.route("**/api/library/session/1", (route) => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { message: "Saved" } });
  });
  await page.goto("/dashboard");
  await page.locator("#librarySearchForm input").fill("plants");
  await page.getByRole("button", { name: "Search library" }).click();
  await expect(page.locator("#libraryResults")).toContainText("Plant notes");
  await page.getByRole("button", { name: "Folder / tags" }).click();
  await page.locator('#organizationForm input[name="folder"]').fill("Revision");
  await page.locator("#organizationForm button").first().click();
  await expect.poll(() => saved?.folder).toBe("Revision");
});
for (const theme of ["light", "dark"])
  for (const [name, width] of [
    ["desktop", 1280],
    ["mobile", 393],
  ])
    test(`${theme} ${name}: account, privacy and library controls are readable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (value) => localStorage.setItem("ss-theme", value),
        theme,
      );
      await page.goto("/account.html");
      await expect(page.locator("#accountTools")).toBeVisible();
      expect(
        (await contrast(page, "#passwordForm button")).ratio,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/artifacts/account-${theme}-${name}.png`,
        fullPage: true,
      });
      await page.goto("/privacy.html");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/artifacts/privacy-${theme}-${name}.png`,
        fullPage: true,
      });
      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Search library" }).click();
      await page.locator("#librarySearchForm").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.local/artifacts/library-${theme}-${name}.png`,
      });
    });

test("print preview transfers questions privately and consumes its temporary record", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "View Details" }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print quiz", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator("#printQuestions")).toContainText(
    "plant energy conversion",
  );
  await expect(popup.locator("#answerKey")).toContainText("Photosynthesis");
  expect(await popup.evaluate(() => location.hash)).toBe("");
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("study-private:print:"),
        ).length,
    ),
  ).toBe(0);
  await popup.close();
});

test("DOCX extraction rejects oversized ZIP directories before decompression", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(() => {
    const small = new ArrayBuffer(22),
      view = new DataView(small);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(10, 2001, true);
    try {
      window.DocumentLimits.docx(small);
      return "accepted";
    } catch (error) {
      return error.message;
    }
  });
  expect(result).toContain("too many embedded files");
});

test("account session revocation and password recovery send only fixture requests", async ({
  page,
}) => {
  let revoked = false,
    email;
  await page.route("**/api/account/sessions/fixture-session", (route) => {
    revoked = route.request().method() === "DELETE";
    return route.fulfill({ json: { message: "Revoked" } });
  });
  await page.route("**/api/account/recovery", (route) => {
    email = route.request().postDataJSON().email;
    return route.fulfill({
      json: {
        message:
          "If this address has an account, a recovery link will be emailed.",
      },
    });
  });
  await page.goto("/account.html");
  await page.locator("#recoveryForm input").fill("dummy@local.test");
  await page.getByRole("button", { name: "Send recovery link" }).click();
  await expect.poll(() => email).toBe("dummy@local.test");
  await page.locator("#activeSessions button").click();
  await expect.poll(() => revoked).toBe(true);
});

test("select-all choices toggle exactly once through delegated CSP handlers", async ({
  page,
}) => {
  await page.route("**/api/study/practice", (route) =>
    route.fulfill({
      json: {
        quiz: [
          {
            questionText: "Choose two",
            questionType: "select_all",
            options: ["A", "B", "C"],
            correctAnswer: ["A", "B"],
          },
        ],
      },
    }),
  );
  await page.goto("/practice");
  await page.locator("#practiceTopic").fill("Choices");
  await page.locator("#practiceGenerateBtn").click();
  await page.locator('input[value="A"]').check();
  await page.locator('input[value="B"]').check();
  expect(await page.evaluate(() => window.userQuizAnswers[0])).toEqual([
    "A",
    "B",
  ]);
  await page.locator('input[value="A"]').uncheck();
  expect(await page.evaluate(() => window.userQuizAnswers[0])).toEqual(["B"]);
});

test("admin reliability shows response success, quota statuses and timings in both themes", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: { user: { id: 9999, email: "owner@local.test", isAdmin: true } },
    }),
  );
  await page.route("**/api/admin/status", (route) =>
    route.fulfill({
      json: {
        unlocked: true,
        emailConfigured: true,
        smsConfigured: false,
        twoFactor: { channel: "email" },
      },
    }),
  );
  await page.route("**/api/admin/users*", (route) =>
    route.fulfill({ json: { users: [], nextOffset: null } }),
  );
  await page.route("**/api/admin/quizzes*", (route) =>
    route.fulfill({ json: { quizzes: [], nextOffset: null } }),
  );
  await page.route("**/api/admin/audit*", (route) =>
    route.fulfill({ json: { entries: [] } }),
  );
  await page.route("**/api/admin/usage", (route) =>
    route.fulfill({
      json: {
        selfCount: {
          gemmaUsed: 2,
          gemmaBudget: 1500,
          estimatedInputTokens: 200,
          estimatedOutputTokens: 100,
        },
        googleCloud: { configured: false },
        topUsersToday: [],
      },
    }),
  );
  await page.route("**/api/admin/reliability", (route) =>
    route.fulfill({
      json: {
        providerAttempts: 2,
        providerResponseSuccessPercent: 50,
        note: "Fixture attempts, not live provider calls.",
        groups: [
          {
            model: "gemma-fixture",
            outcome: "provider-error",
            status: "429",
            count: 1,
            average_ms: 500,
            queue_ms: 300,
            provider_ms: 200,
          },
        ],
      },
    }),
  );
  await page.goto("/admin");
  await page.locator('[data-tab="usageTab"]').click();
  await expect(page.locator("#usagePanel")).toContainText("50%");
  await expect(page.locator("#usagePanel")).toContainText(
    "provider-error (429)",
  );
  for (const theme of ["light", "dark"])
    for (const [name, width] of [
      ["desktop", 1280],
      ["mobile", 393],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((value) => window.applyStudyTheme(value), theme);
      await page.locator("#usagePanel").scrollIntoViewIfNeeded();
      expect(
        (await contrast(page, "#usagePanel p")).ratio,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/artifacts/reliability-${theme}-${name}.png`,
      });
    }
});

test('the locally bundled DOCX reader extracts a real document under CSP',async({page})=>{
 const Zip=require('jszip'),zip=new Zip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Fixture document conversion reads enough text without external requests or real AI jobs.</w:t></w:r></w:p></w:body></w:document>');
 let text;await page.route('**/api/study/process',route=>{text=route.request().postDataJSON().extractedText;return route.fulfill({json:{summary:'DOCX fixture summary',warnings:[],savedToAccount:false}})});await page.goto('/');await page.locator('#fileInput').setInputFiles({name:'fixture.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})});await page.locator('#processButton').click();await expect.poll(()=>text).toContain('Fixture document conversion');await expect(page.locator('#summaryOutput')).toContainText('DOCX fixture summary');
});
