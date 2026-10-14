# Selected audit improvements

User authorized implementation and subsequently authorized committing/pushing after the Account navigation correction. Preserve real free Gemma/shared Turso for manual local development. All automated validation uses test databases/mocks. Never migrate or modify shared Turso during testing. Leave changes uncommitted. Treat `f2m` as F2 (source citations).

Statuses: not complete / partial / complete. Complete means implemented and validated; external service activation is documented separately.

| Item | Status | Work |
| --- | --- | --- |
| S1 | complete | Origin checks, browser security headers and compatible CSP |
| S3 | complete | Revocable login/admin sessions |
| S4 | complete | Terminable isolated JavaScript runner |
| S5 | complete | Complete AI input bounds/types |
| S6 | complete | Dependency updates and production dependency separation |
| S7 | complete | Privacy notice, retention, account-specific browser storage |
| B1 | complete | Stripe synchronization race |
| B2 | complete | Billing redirect configuration |
| B3 | complete | Zero answers, tolerance, selectable answers |
| B4 | complete | Grading errors preserve unanswered state |
| B5 | complete | Stable flashcard identities for async responses |
| B6 | complete | Retry subsets track question identities |
| B7 | complete | Clipboard button async references |
| B8 | complete | Practice follow-up actions |
| B9 | complete | Session deletion removes reviews |
| B10 | complete | Bounded chat history without duplicate prompts |
| B11 | complete | Premium bonus enforcement |
| B12 | complete | Quiz personalization grounded in authorized material |
| B13 | complete | Premium model/pricing match verified configuration |
| P1 | complete | Paginate libraries/reviews/admin details; lightweight previews |
| P2 | complete | Reuse totals, coalesce monitoring refresh, notification deadlines |
| P3 | complete | Generated content validation and partial warnings |
| P4 | complete | Shared free-model minute admission |
| P5 | complete | Upload count/page/text/time limits |
| P7 | complete | Monthly monetary budgets, billing portal, checkout dedup, subscription deletion |
| P8 | complete | Modular frontend helpers and behavioral regression tests |
| F1 | complete | Due Today study session and synchronized short review intervals |
| F2 | complete | Verifiable source/page citations |
| F5 | complete | Anki/CSV, printable quizzes, study-set exports |
| F6 | complete | Folders/tags/search across saved study material |
| F7 | complete | Password recovery/change, active sessions, export/delete account |
| F8 | complete | AI reliability dashboard |

## Validation

- npm test: 95 passed (isolated databases and provider mocks).
- npm run test:oracle: production startup/auth/proxy fixture passed.
- npm run tailwind:build: passed; production minified build also passed.
- npm run test:ui: 56 passed, including Account visibility/order for guests, members and admins across five pages, desktop/mobile and both themes.
- Full and production-only npm audits: zero advisories at final verification.
- Clean npm ci, vendor assets, production CSS build, dependency pruning and pruned-package HTTP smoke test passed.
- Mammoth CLI and the updated native development watcher were checked after dependency overrides.
- Desktop/mobile light/dark screenshots were reviewed for account, privacy, library, saved reader and reliability screens; screenshots are under ignored .local/artifacts.
- Source JavaScript syntax and git diff --check passed. Credentials/private environment files remain untouched and untracked.
- Docker/ARM64 execution was not available in this Windows environment. Node.js 24 ARM64 image execution still needs the future authorized deployment; these checks used local Node.js 26.
- One Windows backend worker exited after its assertions on an intermediate run; subsequent complete suites passed. No reproducible assertion failure remains.

## Decisions and operational notes

- Premium model names were checked without displaying credentials; private configuration is unchanged.
- No live Stripe charges, email/SMS, AI calls, or shared database changes during automated tests.
- Schema upgrades will be additive and run only during a future authorized production deployment.
- Existing login tokens will need a fresh sign-in when revocable sessions are enabled.

- Private configuration confirmed `gemini-2.5-flash-lite`; defaults and pricing now follow it. Google lists standard text rates of $0.10/$0.40 per million tokens.
- Full/runtime npm audits report zero vulnerabilities. Scoped overrides replace the affected watcher and Mammoth CLI formatter dependency chains; CSS watching, CLI help and real browser DOCX conversion passed.
- All selected implementation and fixture validation is complete. The user authorized publishing this update after the final Account navigation correction; deployment completion is verified through GitHub Actions and public health.

## Activation and limits

- Read SECURITY-UPGRADE.md for deployment, migration, budgets and operator setup. Existing passwords/study data are retained; production startup adds the selected schema changes only on a future authorized deployment.
- Email recovery requires configured SMTP/Resend; subscription management requires Stripe Customer Portal configuration. Real delivery/payment/cancellation was not exercised.
- Before deployment, manual local login uses ignored .local/development-state.sqlite; generation/regeneration remain compatible with the previous shared schema. Organization needs the new production columns. Local account security mutations are disabled; use the live account page for recovery/password/deletion. Restart local development after deployment to join shared minute admission.
- Verified excerpts establish provenance, not correctness; summary excerpts are labelled related. Existing content is not retroactively cited.
- Tailwind 4 needs modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+). External Google/Stripe outages, unrelated project calls, and provider billing remain outside app control.
- Mandatory email verification (S2), branch protection, background resumable jobs and inline editing were excluded.

## Final navigation correction

Account is hidden by default and shown only after authentication. Desktop/mobile menus place it immediately after Dashboard and before Admin. Dashboard/admin pages now apply the shared authentication navigation state. Browser fixtures confirmed all three roles on every main page and captured navigation screenshots.
