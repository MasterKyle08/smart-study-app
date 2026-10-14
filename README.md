# Smart Study

Turn worksheets, PDFs, photos, DOCX files, or pasted notes into summaries, flashcards, and quizzes. Works in the browser on phones and computers.

Free users share **Gemma 4** (`gemma-4-31b-it`) from Google’s free tier. Premium is optional ($6/month): it uses **Gemini Flash-Lite** on a separate API key so paid traffic does not empty the shared free pool.

Free requests can fall back to `gemma-4-26b-a4b-it` during provider errors/timeouts. See [AI reliability and diagnostics](deploy/oracle/AI-RELIABILITY.md) for defaults and logs.

Live site repo: [MasterKyle08/smart-study-app](https://github.com/MasterKyle08/smart-study-app)

## What it does

- Upload images, PDFs, DOCX, or text; paste notes; optional vision OCR for scanned worksheets
- Generate a summary, flashcards, and a quiz from the material in front of you
- Practice studio for CS, calculus, and data-science style sets
- Public quiz library (premade quizzes you can publish, edit, or delete)
- Spaced repetition (SM-2) for flashcards
- Light / dark theme
- Signed-in users keep sessions on their dashboard; anonymous study is not saved
- Global free-request meter (`used/limit`) plus a personal daily action cap
- Optional extra action after viewing an AdSense unit (do not click the ad)
- Admin console at `/admin` (2FA step-up, user/data/quiz tools, audit log)

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML/JS, Tailwind, KaTeX |
| Client extract | PDF.js, Tesseract.js v5, Mammoth (DOCX) |
| Backend | Node.js, Express |
| Database | Turso (libSQL) |
| Auth | Revocable sessions + JWT in an HttpOnly `ss_token` cookie |
| Free AI | Google Generative Language API, Gemma 4 |
| Premium AI | Gemini 2.5 Flash-Lite on a second key |
| Payments | Stripe (PayPal / Lemon Squeezy hooks exist) |
| Ads | Google AdSense display; reward claims disabled |

## Local setup (new laptop)

See [the security upgrade guide](SECURITY-UPGRADE.md) before deploying the prepared account, quota, privacy, billing, and PDF changes. It explains database preflight, owner/admin verification, new budgets, and provider setup.

See [local development and review](LOCAL-DEVELOPMENT.md) for real free Gemma testing on localhost, dummy-user/shared-Turso limits, browser checks, and the review-before-push process. Coding agents must follow [AGENTS.md](AGENTS.md).

For Oracle Cloud Ampere A1 on Ubuntu 26.04, follow the [Oracle hosting guide](deploy/oracle/README.md). It uses the prepared ZIP uploaded through FileZilla, a persistent `screen -S website` terminal for extraction/setup, Docker, and automatic HTTPS.

The prepared Oracle address is `https://study.132-145-197-174.sslip.io`. Upload the private `.env.oracle` as the server `.env` after adding the Gmail app password; keep the local `.env` for development.

For updates on every push to `main`, follow the [GitHub auto-deployment setup](deploy/oracle/AUTO-DEPLOY.md). It works with the existing ZIP-installed server and preserves its private `.env`.

Keep `.env`, `.env.oracle`, `node_modules`, and SQLite files out of GitHub. Transfer private configuration directly between machines; Oracle uses `.env.oracle` uploaded privately over SFTP as described in the hosting guide. Environment files are gitignored on purpose.

```bash
git clone https://github.com/MasterKyle08/smart-study-app.git
cd smart-study-app
npm install
# place your private .env in the project root (never commit it)
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Local development uses a separate login-signing key and skips startup migrations/cleanup against shared Turso. See the local guide for disabled integrations and dummy-user testing.

| Script | What it does |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Nodemon + Tailwind watch |
| `npm test` | Unit tests |
| `npm run tailwind:build` | Rebuild readable `public/css/style.css` |
| `npm run tailwind:build:production` | Build minified production CSS |
| `npm run test:ui` | Isolated browser and contrast checks |
| `npm run init-db` | Create/migrate Turso tables |

Production startup applies the database schema. Local startup checks the existing database without applying migrations or cleanup.

### Private configuration

Local development reads private `.env.local` (or the existing `.env` as a fallback). It generates its own signing key in `.local/session.secret`. Production reads the server `.env` and requires its own `JWT_SECRET`. Google keys are needed for real AI, and Turso credentials are needed for database access:

```
GOOGLE_API_KEY=
GOOGLE_AI_MODEL_NAME=gemma-4-31b-it
JWT_SECRET=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
ADMIN_EMAIL=
```

Fill in when you are ready (already listed in the local `.env` as empty):

```
GOOGLE_FREE_API_KEY=              # optional alias for the free key
GOOGLE_PREMIUM_API_KEY=           # second AI Studio project for Premium
GOOGLE_PREMIUM_MODEL_NAME=gemini-2.5-flash-lite
PREMIUM_USER_EMAILS=
PREMIUM_MONTHLY_PRICE=6
PREMIUM_PRICE_LABEL=$6 / month
GEMMA_DAILY_BUDGET=1500
FREE_DAILY_JOBS=24
ANON_DAILY_JOBS=10
PREMIUM_DAILY_JOBS=200
AD_REWARDS_PER_DAY=2
AD_COOLDOWN_HOURS=4
JOBS_PER_AD=1
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_VARIANT_ID=
ADSENSE_CLIENT_ID=
ADSENSE_SLOT_ID=
ADSENSE_VIEW_SECONDS=15
ADMIN_NOTIFY_EMAIL=
ADMIN_OWNER_EMAILS=
ADMIN_SESSION_MINUTES=20
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
RESEND_API_KEY=
EMAIL_FROM=
GCP_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=
GCP_SERVICE_ACCOUNT_JSON=
GCP_MONITORING_CACHE_SECONDS=90
```

Never put API keys, Twilio tokens, Stripe secrets, or a Google service-account JSON in the frontend or in git.

## Pages

| Path | Purpose |
|---|---|
| `/` | Upload / paste and generate |
| `/practice` | CS / math / data practice |
| `/premade` | Public quiz library |
| `/dashboard` | Saved sessions, billing, due cards |
| `/admin` | Staff only; 2FA every visit |

## Free vs Premium

- **Free:** Gemma 4, shared site-wide budget (default 1,500 requests/day, midnight Pacific). Personal cap default 24 study actions/day (10 if not signed in). Ads can add +1 action, at most twice a day, with a 4-hour gap. Ads cannot buy extra Google quota.
- **Premium:** $6/month. Gemini Flash-Lite on `GOOGLE_PREMIUM_API_KEY`. Default 200 actions/day. Does not consume the Gemma pool.

The public meter calls **your** backend only: `GET /api/usage/quota` returns `{ used, limit }`. Google Cloud credentials never go to the browser.

Optional Cloud Monitoring (admin + public meter if configured): set `GCP_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` to a service account with `roles/monitoring.viewer`. The metric is `serviceruntime.googleapis.com/api/request_count` on `generativelanguage.googleapis.com`. It can lag several minutes. Job enforcement still uses Smart Study’s own count.

## Admin

1. Set `ADMIN_EMAIL` to your account and restart.
2. Sign in, open **Admin** (link only shows for admins).
3. Enter a 2FA code every visit. In development with no Twilio, the code is printed in the server log. In production, configure Twilio SMS (or SMTP/Resend email).
4. Destructive actions also need your password and a typed confirmation (`WIPE`, the user’s email, or the quiz slug).
5. Owner cannot be demoted, banned, or deleted. The last admin cannot be removed. Actions are written to an audit log.

Promote/demote emails `ADMIN_NOTIFY_EMAIL` (or `ADMIN_EMAIL`) when SMTP or Resend is set.

## Pushing updates from this laptop

`.env` is gitignored. Commit code only:

```bash
git status
git add -A
git commit -m "Your message"
git push origin main
```

If GitHub asks you to sign in, use a [personal access token](https://github.com/settings/tokens) as the password, or GitHub CLI (`gh auth login`).

## Tests

```bash
npm test
```

Covers quiz/flashcard parsing, ownership checks, usage math, SM-2, admin safety rules, and the public quota payload (no GCP secrets).
