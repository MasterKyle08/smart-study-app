# Smart Study

Turn worksheets, PDFs, photos, DOCX files, or pasted notes into summaries, flashcards, and quizzes. Works in the browser on phones and computers.

Free users share **Gemma 4** (`gemma-4-31b-it`) from Google’s free tier. Premium is optional and cheap ($5/month): it uses **Gemini 3.5 Flash-Lite** on a separate API key so paid traffic does not empty the shared free pool.

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
| Auth | JWT in an httpOnly `ss_token` cookie |
| Free AI | Google Generative Language API, Gemma 4 |
| Premium AI | Gemini 3.5 Flash-Lite on a second key |
| Payments | Stripe (PayPal / Lemon Squeezy hooks exist) |
| Ads | Google AdSense display (view-to-unlock, not click-to-unlock) |

## Local setup (new laptop)

You do **not** upload `.env`, `node_modules`, or the SQLite files. Those stay on the machine.

```bash
git clone https://github.com/MasterKyle08/smart-study-app.git
cd smart-study-app
npm install
copy .env.example .env   # Windows
# then fill in real values, or copy .env from your old laptop (never commit it)
npm start
```

Open [http://localhost:3000](http://localhost:3000).

| Script | What it does |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Nodemon + Tailwind watch |
| `npm test` | Unit tests |
| `npm run tailwind:build` | Rebuild `public/css/style.css` |
| `npm run init-db` | Create/migrate Turso tables |

The database schema is also applied when the server starts.

### Required `.env` for a basic run

```
GOOGLE_API_KEY=          # AI Studio key for free Gemma
JWT_SECRET=              # long random string
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
ADMIN_EMAIL=             # your login email; this account is the owner admin
```

Copy the rest from `.env.example`. Never put API keys, Twilio tokens, Stripe secrets, or a Google service-account JSON in the frontend or in git.

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
- **Premium:** $5/month. Gemini Flash-Lite on `GOOGLE_PREMIUM_API_KEY`. Default 200 actions/day. Does not consume the Gemma pool.

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
