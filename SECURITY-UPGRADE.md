# Security and performance upgrade

This release includes the requested security and performance improvements. Tests use in-memory databases and intercepted provider/browser fixtures. Keep using real free Gemma and the shared database for manual development after its schema has been upgraded; local startup still does not apply migrations.

## Before the next authorized deployment

Take a private Turso backup using your database provider's export/backup tooling. The deployment's new read-only preflight checks for conflicting email identities and duplicate flashcard reviews before replacing the running application's files. If it finds a conflict, deployment stops and no accounts or reviews are automatically merged or deleted. Review the affected rows privately and resolve them deliberately before retrying; do not reset the database.

Production startup adds schema columns, quota/billing tables, and indexes. Existing account passwords, study sessions, and published quizzes are retained. A unique index now identifies emails by `LOWER(TRIM(email))`. Existing trusted admin rows matching configured owner addresses receive a stored owner flag during the one-time migration; future changes to owner email configuration do not automatically grant account roles. Public registration cannot claim configured owner or Premium-whitelist addresses. Existing owners sign in normally with their current password.

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

Anonymous visitors default to 40 requests/day unless `FREE_DAILY_REQUESTS` is explicitly configured. The shared free pool is reserved separately and cannot be exceeded by concurrent app requests. Model-specific minute pacing is still per process, so local and live traffic sharing a Google project can still compete. Image token estimates vary; these controls are application admission budgets, not an exact currency spend limit. Configure appropriate restrictions/monitoring in the paid Google project before enabling Premium.

There are at most two active study tasks per account/IP and 24 across a process. Provider concurrency is two free / four Premium, with at most 24 waiting calls. Client disconnects abort queued/provider work and stop retries; they cannot guarantee that Google cancels processing already received.

## Stripe and ads

Stripe checkout is enabled only with `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and `GOOGLE_PREMIUM_API_KEY`. Configure `SITE_ADDRESS` or a trusted HTTPS `PUBLIC_ORIGIN`. Redirect settings must be relative paths. PayPal/Lemon Squeezy remain unavailable because their integrations are unfinished.

In Stripe, subscribe the endpoint `/api/billing/webhook/stripe` to checkout completion and asynchronous payment events, customer subscription created/updated/deleted/paused/resumed, and invoice paid/payment_failed/payment_action_required/voided/marked_uncollectible/finalization_failed events. The webhook verifies the original signed raw body, associates checkout IDs with server-stored accounts, retrieves authoritative current subscription state, and deduplicates processed events. Active subscriptions must have a paid latest invoice, a configured allowed price, and an unexpired billing period. Failed, unpaid, paused, incomplete, and cancelled states do not grant access. Multiple subscriptions are evaluated together, and older events cannot overwrite newer applied events.

Paid access expires using the verified period end even if renewal events stop arriving. Existing Stripe customers with stored customer IDs are synchronized by subsequent genuine subscription/invoice events; do not enable this upgrade for existing paying users without arranging those verified synchronization events. `BILLING_ALLOWED_PRICE_IDS` can list previously sold valid price IDs when changing plans. Refund/dispute policy and real Stripe end-to-end account setup still require separate operational testing; unit tests use signed fixtures/mocked subscription retrieval and never charge a card.

Display ads can remain enabled. Reward claims are disabled at both route and service level because a browser flag/timer cannot prove a completed ad view. Restoring rewards requires integrating a provider with trusted server-side completion verification; configuring AdSense alone does not enable rewards.

## Verification

```text
npm ci
npm test
npm run test:oracle
npm run tailwind:build
npm run test:ui
```

The requested changes do not enable CSP/CORS hardening, change GitHub branch protections, or comprehensively upgrade the other dependencies reported by the audit. Those findings remain separate follow-up work.
