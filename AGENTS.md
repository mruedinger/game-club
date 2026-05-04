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
- Work on `dev` by default. Never commit or merge directly to `main`. `main` only ever advances by fast-forward from `dev`.
- Sync local `dev` with remote `dev` before starting work.
- Two workflows apply depending on the task. Default to Mode A. Switch to Mode B when the user says "submit a pr", explicitly asks for cross-agent review, or for non-trivial bug fixes that benefit from independent verification. If unsure, ask.
- Changes pushed to `dev` auto-deploy to Cloudflare Pages dev; changes pushed to `main` auto-deploy to production. Mode B PR branches also get a Cloudflare Pages preview deploy.

### Mode A — Direct-to-dev iteration (default, UI/UX work)
- Use for changes the user will verify by interacting with the dev site (visual, interactive, content).
- Default post-change workflow (unless the user says not to commit yet): `git add .`, commit with a clear message, push to remote `dev`.
- No PR. Iterate on `dev` and validate on the dev Pages deploy.

### Mode B — Cross-agent review via PR (bug fixes / second-opinion work)
- Trigger: user says "submit a pr" or similar, explicitly asks for cross-agent review, or asks for a non-trivial bug fix.
- Precondition: `dev` must be in sync with `main` before opening the PR. If there are unshipped Mode A commits on `dev`, surface that and ask the user before proceeding (typically: ship the pending Mode A work first via the Mode A release).
- Branch off `dev`. Naming: `bug/<slug>` for bug fixes, `feature/<slug>` for everything else.
- **Author agent:** commit, push the branch, open a PR targeting `dev`, ready for review (not draft unless the user asks for draft). Do not merge your own PR.
- **Reviewer agent** (invoked separately by the user): review the PR on the merits. Outcomes:
  - Approve: update `CHANGELOG.md` on the PR branch, commit and push, merge the PR into `dev`, then run the Mode B release workflow below.
  - Request changes: leave specific actionable feedback as a PR comment. The author agent addresses it on the same branch; the user re-invokes the reviewer.

## Release Workflow

### Mode A release (when the user confirms the task is done and ready for production)
1. Update `CHANGELOG.md` on `dev` — summarize the shipped work (features added/changed/removed, bugs fixed). Do not log iteration steps; summarize the outcome.
2. Commit the changelog update to `dev` and push.
3. Comment on and close any relevant GitHub issues.
4. Fast-forward merge `dev` into `main`: `git checkout main && git merge --ff-only dev && git push origin main && git checkout dev`.

### Mode B release (reviewer agent runs this immediately after merging the approved PR into `dev`)
1. `CHANGELOG.md` was already updated on the PR branch as part of approval and is now on `dev` via the merge.
2. Comment on and close any relevant GitHub issues.
3. Fast-forward merge `dev` into `main`: `git checkout main && git merge --ff-only dev && git push origin main && git checkout dev`.

- Use `CHANGELOG.md` for cross-session context on shipped changes.

## Validation and Temp Files
- Validate changes in the deployment environment that matches the branch (`dev` -> Pages dev, `main` -> production).
- Run `npm run test:e2e` for major changes (significant new features, large refactors). Use judgment for smaller changes. If tests fail, note it and continue.
- Use the repo's `tmp/` directory for temporary log/file storage.

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
