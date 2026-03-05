# Game Club Agent Instructions

## Startup
- Read `PROJECT_BRIEF.md` at the start of each session.
- Treat `PROJECT_BRIEF.md` as authoritative for product scope, architecture decisions, and guardrails.
- Ask the user before violating any guardrail in `PROJECT_BRIEF.md` or this file.

## Workflow
- Planning-first workflow: When asked to solve a problem, implement a feature, or tackle a GitHub issue, present a plan first and ask clarifying questions before making changes. For follow-up tweaks or minor edits, use conversation context to decide whether to skip this pattern.
- Prefer simple and efficient solutions. When tradeoffs exist, prioritize long-term correct architecture over short-term quick fixes.
- Prefer latest stable versions of apps/tools/libraries/frameworks; avoid version locking to older releases.
- When requirements are ambiguous, ask before proceeding — do not make assumptions and correct later.
- When blocked mid-task, exhaust reasonable alternatives first, then surface findings.
- Small related issues discovered during a task: use judgment to fix them without asking, unless there is ambiguity.
- When troubleshooting external APIs, include `curl` commands the user can run locally.
- Communication: be concise. After completing a task, provide a brief summary of what changed. For multi-step tasks, give a final summary rather than progress updates along the way.
- After changes, provide a short validation checklist or playbook. If the change introduces a new env var, flag it explicitly so it can be set in Cloudflare before the next deployment.

## Branching and Release
- Work on `dev` by default. Do not commit, push, or merge to `main` unless explicitly instructed.
- No pull requests — commit directly to `dev`. The user will request a merge to `main` when ready.
- Default post-change workflow (unless the user explicitly says not to commit yet): `git add .`, commit with a clear message, and push to remote `dev`.
- Changes pushed to `dev` are automatically deployed to Cloudflare Pages dev deployment.
- Changes pushed to `main` are automatically deployed to Cloudflare Pages production deployment.
- Update `CHANGELOG.md` only when changes are merged to `main`.
- Use `CHANGELOG.md` for cross-session context on shipped changes.

## Validation and Temp Files
- Validate changes in the deployment environment that matches the branch (`dev` -> Pages dev, `main` -> production).
- Run `npm run test:e2e` for major changes (significant new features, large refactors). Use judgment for smaller changes. If tests fail, note it and continue.
- Use `/tmp/` for temporary logs/files created during development.

## Cloudflare Observability
- Use `PROJECT_BRIEF.md` as the canonical source for environment topology (URLs, Pages projects, D1 databases).
- Never commit secrets or tokens to the repo.
- After each push, verify deployment status for the pushed SHA via GitHub check-runs (`Cloudflare Pages: game-club-dev` and `Cloudflare Pages: game-club`).
- Cloudflare Pages builds may take several minutes; poll deployment/check status every 30-60 seconds for up to 10 minutes before treating a deployment as failed.
- After deployment success, run post-deploy smoke checks against the matching live site (`dev` or `main` target): verify `GET /` and `GET /api/games` return successful responses, then validate changed user flows.
- If deployment or runtime issues occur, inspect Cloudflare logs with Wrangler (`pages deployment list` / `pages deployment tail`) and include relevant findings in the update.

## Environment Variables
- App/runtime vars are documented in `.env.example` in the repo root.
- The following vars are required for agent-driven deployment validation and Cloudflare CLI access; they are not in `.env.example` and must be set in the agent session environment:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `WRANGLER_LOG_PATH` (resolve path from this var; do not hard-code a log directory)
