# Game Club Agent Instructions

## Startup
- Read `PROJECT_BRIEF.md` at the start of each session.
- Treat `PROJECT_BRIEF.md` as authoritative for product scope, architecture decisions, and guardrails.
- Ask the user before violating any guardrail in `PROJECT_BRIEF.md` or this file.

## Workflow
- Planning-first workflow: When asked to solve a problem, implement a feature, or tackle a GitHub issue, present a plan first and ask clarifying questions before making changes. For follow-up tweaks or minor edits, use conversation context to decide whether to skip this pattern.
- Prefer simple and efficient solutions that preserve long-term architecture.
- When troubleshooting external APIs, include `curl` commands the user can run locally.
- After changes, provide a short validation checklist or playbook.

## Branching and Release
- Work on `dev` by default. Do not commit, push, or merge to `main` unless explicitly instructed.
- Default post-change workflow (unless the user explicitly says not to commit yet): `git add .`, commit with a clear message, and push to remote `dev`.
- Changes pushed to `dev` are automatically deployed to Cloudflare Pages dev deployment.
- Changes pushed to `main` are automatically deployed to Cloudflare Pages production deployment.
- Update `CHANGELOG.md` only when changes are merged to `main`.
- Use `CHANGELOG.md` for cross-session context on shipped changes.

## Validation and Temp Files
- Validate changes in the deployment environment that matches the branch (`dev` -> Pages dev, `main` -> production).
- Baseline test command: `npm run test:e2e` (when relevant to the change).
- Use `/tmp/` for temporary logs/files created during development.

## Cloudflare Observability
- Use `PROJECT_BRIEF.md` as the canonical source for environment topology (URLs, Pages projects, D1 databases).
- Required local env vars for Cloudflare CLI access in agent sessions:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `WRANGLER_LOG_PATH=.wrangler-logs`
- Never commit secrets or tokens to the repo.
- After each push, verify deployment status for the pushed SHA via GitHub check-runs (`Cloudflare Pages: game-club-dev` and `Cloudflare Pages: game-club`).
- If deployment or runtime issues occur, inspect Cloudflare logs with Wrangler (`pages deployment list` / `pages deployment tail`) and include relevant findings in the update.
