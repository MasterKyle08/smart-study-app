# Project workflow for coding agents

## Release preference

The user explicitly wants completed changes left for review. Do not commit, push, publish, or trigger a deployment unless the user subsequently asks for that action. Once a commit/push is authorized, complete the authorized action without asking again.

The repository is `MasterKyle08/smart-study-app`; the deployment branch is `main`. A push to main triggers `.github/workflows/oracle-deploy.yml` and updates the live Oracle website. It is a production deployment, not just a backup of code.

## Before and during changes

- Read `git status --short` first. Preserve unrelated and user-authored changes.
- Inspect and edit source styles in `public/css/input.css`; regenerate `public/css/style.css` with `npm run tailwind:build`. Do not hand-edit generated CSS.
- Keep `.env`, `.env.local`, `.env.oracle`, SSH keys, `.local` artifacts, database exports, and credentials out of Git. Never print secret values.
- Manual local development uses real free Gemma 4 and the existing shared Turso database by the user's request. Use a dummy/free user. Calls consume the same Google project's free quota, and saved dummy-user records appear in the shared database.
- `npm start` / `npm run dev` use localhost port 4173, a separate local signing key, free AI only, and no email/payment/monitoring integrations. Local startup must not migrate the shared database, seed owner roles, or clean up production records.
- Check for an existing preview on port 4173 before starting a second server. Reuse the running preview or restart only a process you can identify as your own project instance; do not kill unrelated Node processes.
- Automated tests must use in-memory/test databases and mocked external services. Browser tests must not create live accounts, submit live AI jobs, send mail, or change production data. Use browser fixtures for UI states.
- Do not run reset/delete SQL, production schema migrations, or `npm run init-db` against shared Turso while testing unless the user explicitly asks for that database action.

## Validation and handoff

Run checks appropriate to the change. For app/release changes, the baseline is:

```text
npm test
npm run test:oracle
npm run tailwind:build
```

For visual changes also run `npm run test:ui`, inspect desktop/mobile and light/dark states, and review screenshots under `.local/artifacts`. Check readable links, controls, focus, hover, dialogs, feedback, and generated content.

Report what changed, the checks/results, and practical limitations. Leave the changes uncommitted for review by default. Link relevant files and any screenshots needed for assessment.

## When the user authorizes committing/pushing

1. Review `git diff` and staged paths. Stage the requested change and any explicitly authorized pending changes; do not blindly stage unrelated work.
2. Complete the relevant checks and commit with a clear description.
3. Push the authorized branch. Main deploys production; other branches do not deploy through this workflow.
4. Inspect the GitHub Actions `Deploy to Oracle` run for that commit and verify the public website health after a successful deployment. Do not report it deployed just because push succeeded.
5. If credentials or deployment fail, report the exact failed step and finish any authorized fixes that can be made safely. Never bypass SSH host-key verification.

## Deployment facts

- Live URL: `https://study.132-145-197-174.sslip.io`.
- Host: Ubuntu 26.04 ARM64, SSH user `ubuntu`.
- Server project: `/home/ubuntu/smart-study-app`.
- Runtime: Docker Compose, Node.js 24, Caddy automatic HTTPS, remote Turso.
- The workflow deploys committed source via SSH; the original server installation used a ZIP and needs no Git checkout.
- Preserve the server `.env`, `.deploy` lock/state, backups, Turso data, and certificate volumes. Do not use `docker compose down -v` or prune volumes.
- Refer to `deploy/oracle/AUTO-DEPLOY.md` for deployment credentials and troubleshooting, and `deploy/oracle/AI-RELIABILITY.md` for free Gemma behavior.

## Selected audit work

Read `IMPLEMENTATION-PROGRESS.md` when continuing the selected security, bug, performance and feature update. It records item status, validation and activation requirements. Completed implementation does not authorize a commit, push, migration or deployment.
