# Local development and review

The user wants changes left for review. Commits and pushes happen only when requested; pushing `main` updates the live Oracle website through GitHub Actions.

Manual local development uses **real free Gemma 4** and the **existing Turso database**, as requested. Use a dummy/free account. This is not fake AI: successful calls consume the same project's free quota, and dummy-user sessions/usage are written to the shared database. The local hostname and signing key are separate from production. Local startup does not migrate tables, seed admin roles, or delete expired records. Local email, payments, paid AI, ads, and cloud monitoring are disabled.

Google enforces input tokens per minute as well as requests per minute/day. Free uploads with multiple selected outputs now send the source once in a combined request. The app paces input tokens and respects quota cooldowns, and coordinates minute admission with live traffic through shared Turso after the new production schema is deployed. Before deployment it uses private minute admission without migrating Turso; other tools still compete for project quota. For independent free quota, use a key from a separate Google project in `.env.local`. A second key in the same project shares its quota. See `deploy/oracle/AI-RELIABILITY.md` for limits and settings.

## Run locally

```text
npm ci
npm run tailwind:build
npm start
```

Open **http://127.0.0.1:4173**. For server/CSS auto-reload:

```text
npm run dev
```

If already running with `npm start`, finish any active request, press Ctrl+C in that terminal, and run `npm start` again to load backend changes. `npm run dev` reloads backend changes automatically.

Local settings come from private `.env.local`, or the existing private `.env` if `.env.local` is absent. Production deployment reads the server `.env` with `NODE_ENV=production` and does not use local settings. Never set production mode just to preview this app locally.

`npm run tailwind:build` generates readable CSS for review. The Docker build uses `npm run tailwind:build:production` to minify the production stylesheet.

The prepared `.env.local` contains your existing Google/Turso credentials and a local port. The local signing key is generated under `.local/session.secret`, which is ignored by Git. Do not replace the live JWT secret to set up local development.

Use a dummy account for manual saved-content tests. Do not publish dummy quizzes to the public library or use destructive admin tools against real users. This database is shared, so test records are not magically separate; use an isolated test database if a task needs unrestricted data mutation.

## Automated checks

```text
npm test
npm run test:oracle
npm run tailwind:build
npm run test:ui
```

Automated tests use an in-memory database and browser fixtures/mocked API responses, so they do not consume Google quota or touch shared Turso. UI tests use Edge on Windows by default and Chromium on CI. If needed on Linux, install the browser with `npx playwright install --with-deps chromium`. Override the browser channel with `PLAYWRIGHT_CHANNEL` where appropriate.

Screenshots/reports are written under `.local/artifacts`, `test-results`, and `playwright-report`, all ignored by Git. The browser test server listens on loopback port 4180 and uses its own in-memory records. Manual local development is on port 4173.

Review the changes and test results before authorizing a commit/push. See `AGENTS.md` for the release steps future agents must follow.

Local login/admin sessions use ignored `.local/development-state.sqlite`. Dummy-user study data stays in shared Turso. Recovery/password changes/account deletion are disabled locally to protect shared identities. Folder organization needs the next authorized production schema upgrade; upload generation and regeneration work against the prior schema. Restart local development after deployment to join shared minute admission.
