# Security and performance upgrade

This release includes the selected security, bug, performance and feature improvements. Tests use isolated databases and intercepted providers/browser fixtures. Manual development keeps real free Gemma and shared Turso without migrating production; local login sessions use private SQLite state.

## Before the next authorized deployment

Take a private Turso backup using your database provider's export/backup tooling. The deployment's new read-only preflight checks for conflicting email identities and duplicate flashcard reviews before replacing the running application's files. If it finds a conflict, deployment stops and no accounts or reviews are automatically merged or deleted. Review the affected rows privately and resolve them deliberately before retrying; do not reset the database.

Production startup adds schema columns, revocable sessions, recovery tokens, source evidence, library organization, shared minute reservations, monthly spending, reliability events, quota/billing tables and indexes. Existing passwords and study material are retained. Existing browser tokens become invalid; everyone must sign in again after deployment. A unique index identifies emails by `LOWER(TRIM(email))`. Existing trusted admins matching configured owner addresses receive an owner flag during the one-time migration; configuration changes do not automatically grant roles. Public registration cannot claim configured owner or Premium-whitelist addresses.

If a new installation has no owner account, or a legitimate existing account needs explicit owner assignment, run this operator-only command **after the production schema is initialized**, from PuTTY/Screen in the server project:

```bash
cd /home/ubuntu/smart-study-app
read -rs -p 'Owner password: ' study_owner_password; printf '\n'
printf '%s' "$study_owner_password" | sudo docker compose run -T --rm --no-deps app node backend/scripts/bootstrap-owner.js
unset study_owner_password
```

The command uses `ADMIN_EMAIL` from the private server configuration. It creates an owner account only if absent. For an existing account it requires the current password and does not reset it. New owners require a passphrase of at least 12 characters and at most 72 bytes; an existing shorter password remains usable. Do not place the password in command arguments, Git, or chat.

## Admin verification

Configure SMTP/Resend email for first enrollment. A new admin without a verified phone must first unlock with the code delivered to the account's email. Phone enrollment and replacement are available within the unlocked admin page and require its existing step-up cookie. After phone verification, subsequent admin unlock codes use SMS when Twilio is configured. A Twilio-only configuration with no existing verified factor fails closed; it cannot bootstrap an arbitrary phone.

Codes are bound to account, purpose, and the verified destination. Send limits, failed attempts, and consumption run inside write transactions. Invalid attempts still commit their counters. A code cannot be consumed twice by concurrent requests. When step-up expires, the admin UI requests a new verification without treating the ordinary login as expired.

## Quizzes and saved uploads

New library quizzes are private unless the creator explicitly checks publication. Previously public quizzes remain public. Public readers receive questions, titles, descriptions, tags, and answers, but never the original reference text. Owners still receive their source for editing/personalization. Private orphan quizzes remain inaccessible to anonymous visitors.

Saved sessions load as paginated short previews; full source/cards/quizzes load only when opened. Regeneration uses the same combined free generation path as uploads, retains usable sections with warnings, and stores quiz settings. Large documents use bounded excerpts from their beginning, middle, and end, with a visible omission warning. Split documents into smaller uploads when complete coverage is necessary. The raw text limit is 120,000 characters; the generation context limits remain 14,000 free / 40,000 Premium characters.

PDF.js 6.4.299 is pinned in the lockfile and served locally, loaded when a PDF is selected. `npm ci` prepares assets through `postinstall`; `npm run vendor:build` can rebuild them explicitly. The reader uses `isEvalSupported: false`. Generated assets are ignored by Git and rebuilt in Docker before development dependencies are pruned. One OCR worker is reused per upload and released afterward, and each PDF loading task releases its worker after extraction.

## AI admission and budgets

All AI endpoints check account bans and use the same request/token admission hooks. Objective multiple-choice, select-all, and numeric grading is local; free-text grading and optional explanations/chat still use real AI. Jobs reserve their daily action before generation. An invalid/cancelled action that never reaches a provider refunds its job reservation; attempts that contact a provider retain it, including failed attempts.

Every provider attempt, including retries, atomically reserves a request and estimated input plus maximum output tokens. Google usage reconciles successful reservations. Failed attempts retain their conservative reservation because Google may have consumed work. Admissions cancelled before dispatch refund their reservations. Admin resets clear personal action/request/token allowances atomically, without resetting the shared Google pool; an accounting version prevents old in-flight refunds or reconciliations from subtracting new allowances. Limits are per day in Pacific time and can be set in the server's private `.env`:

```dotenv
FREE_DAILY_REQUESTS=96
PREMIUM_DAILY_REQUESTS=400
FREE_DAILY_TOKEN_BUDGET=200000
PREMIUM_DAILY_TOKEN_BUDGET=1000000
```

Anonymous visitors default to 40 requests/day unless `FREE_DAILY_REQUESTS` is configured. Free minute admission now coordinates through Turso across local/live processes using the same database/model. Process pacing remains an additional safeguard. Calls through AI Studio or other tools still consume project quota. Before production gains the new table, local development falls back to private minute admission without migrating shared Turso; restart local development after deployment to join shared admission.

Premium defaults to your configured `gemini-2.5-flash-lite`, whose standard text/image rates are $0.10 input / $0.40 output per million tokens, checked 2026-10-14 against [Google pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite). Gemini 2.5 requests use `thinkingBudget: 0`. Monthly admission reserves maximum output cost before dispatch and reconciles actual usage; failed attempts retain a conservative reservation. Image token estimates vary. These are application cost allowances, not a Google billing cap; external calls, changed prices and unreported usage need separate provider billing controls.

`PREMIUM_MONTHLY_AI_BUDGET_USD` defaults to 60% of `PREMIUM_MONTHLY_PRICE` per account. `PREMIUM_GLOBAL_MONTHLY_AI_BUDGET_USD` defaults to $20 for the whole paid pool per calendar month in Pacific time. Zero disables new paid calls. Daily quota resets do not reset monthly spending. Unknown models require matching `PREMIUM_INPUT_USD_PER_MILLION` and `PREMIUM_OUTPUT_USD_PER_MILLION` prices.

There are at most two active study tasks per account/IP and 24 across a process. Provider concurrency is two free / four Premium, with at most 24 waiting calls. Client disconnects abort queued/provider work and stop retries; they cannot guarantee that Google cancels processing already received.

## Stripe and ads

Stripe checkout needs `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` and `GOOGLE_PREMIUM_API_KEY`. Configure `SITE_ADDRESS` or a trusted HTTPS `PUBLIC_ORIGIN`. Redirects accept relative paths or legacy absolute URLs on that same origin. PayPal/Lemon Squeezy remain unavailable. Configure Stripe's Customer Portal before using **Manage subscription** on the account page.

In Stripe, subscribe `/api/billing/webhook/stripe` to checkout completion/asynchronous payment events, customer subscription created/updated/deleted/paused/resumed, and invoice paid/payment_failed/payment_action_required/voided/marked_uncollectible/finalization_failed events. The webhook verifies the original signed body, associates checkout IDs with stored accounts, retrieves current subscription state and deduplicates events. Active access needs a paid latest invoice, allowed price and unexpired period. Failed/unpaid/paused/incomplete/cancelled states do not grant access. Shared synchronization locks are acquired before retrieval, including when events have equal creation timestamps.

Paid access expires using the verified period end even if renewal events stop arriving. Existing Stripe customers with stored customer IDs are synchronized by subsequent genuine subscription/invoice events; do not enable this upgrade for existing paying users without arranging those verified synchronization events. `BILLING_ALLOWED_PRICE_IDS` can list previously sold valid price IDs when changing plans. Refund/dispute policy and real Stripe end-to-end account setup still require separate operational testing; unit tests use signed fixtures/mocked subscription retrieval and never charge a card.

Display ads can remain enabled. Reward claims are disabled at both route and service level because a browser flag/timer cannot prove a completed ad view. Restoring rewards requires integrating a provider with trusted server-side completion verification; configuring AdSense alone does not enable rewards.

## Account, study and privacy features

Account settings at `/account.html` support password changes, single-use 30-minute recovery links, device revocation, data export and account deletion. Password changes/recovery revoke every login/admin session. Recovery needs working SMTP or Resend; configure sender credentials privately and verify delivery operationally. Admins must unlock admin mode for sensitive actions. Owner deletion requires an operator transfer. Deletion fails closed when Stripe cancellation is unavailable, and pending checkouts are expired before erasure. Cancellation and erasure share the checkout lock. Tests send no live mail, charges or cancellations.

Local login/admin sessions use ignored `.local/development-state.sqlite` and an independent signing key. Dummy-user material still saves to shared Turso. Generation and regeneration work against the previous deployed schema. Folder organization needs the next production schema release; its local API explains this until then. Recovery, password changes and account deletion are disabled locally to protect shared identities; use the live account page. No shared migration or database reset was run during implementation.

Dashboard **Due Today** loads saved definitions and synchronizes ratings; **Again** schedules a ten-minute repeat. Cards retain their own session identity. Folders, tags and search cover uploads and owned quizzes. Saved uploads offer formula-safe CSV, Anki TSV, study-set JSON and printable quizzes. Account export excludes passwords, recovery links and session tokens.

New cards/questions can include verified source excerpts with filenames and PDF page numbers. Quotes that do not match the submitted source are removed; missing evidence is disclosed. Summary excerpts are labelled *related*, rather than claimed to prove every sentence. Existing material is not retroactively cited. Exact matching establishes provenance, not factual accuracy or entailment. Public quizzes expose their selected evidence excerpts alongside public questions/answers; full original source stays private.

The privacy page covers Google processing, Turso, administrator access, browser state, public material and backups. Reliability events contain model, outcome, timings and token counts, with no prompts or user identity; startup removes events older than 30 days. Admin usage shows seven-day outcomes and queue/provider timings. Retries count as separate attempts; invalid output is separate from provider HTTP success. Manual local development does not record reliability events.

## Browser and dependencies

Same-origin API checks and browser security headers are enabled. CSP blocks inline scripts and page eval; executable study libraries are bundled locally. JavaScript snippets run in a worker with networking disabled and a termination deadline. These measures are not a guarantee against every possible exploit.

The full npm dependency audit is clear at validation time. Tailwind 4 replaces older development tooling; CSS still comes from `public/css/input.css`. Support is Safari 16.4+, Chrome 111+, Firefox 128+ ([requirements](https://tailwindcss.com/docs/upgrade-guide#browser-requirements)). Check ads operationally when AdSense is enabled; tests block third-party ad requests.

Uploads allow five files, 30 MB combined, 10 MB per file, 100 PDF pages, 120,000 extracted characters and a 90-second extraction deadline. OCR/vision counts and render dimensions are bounded. DOCX ZIP metadata is checked before decompression; these limits are safeguards, not a secure parser boundary for every malformed file.

## Verification

```text
npm ci
npm test
npm run test:oracle
npm run tailwind:build
npm run test:ui
```

Branch protection, mandatory email verification, background resumable generation and inline editing were not selected. Changes remain uncommitted until the user authorizes publishing.
