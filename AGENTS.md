# Game Club Agent Instructions

## Startup
- Read `PROJECT_BRIEF.md` before starting substantive work.
- Treat `PROJECT_BRIEF.md` as authoritative for product scope, architecture decisions, and guardrails.
- Ask the user before violating any guardrail in `PROJECT_BRIEF.md` or this file.

## Workflow
- For substantial tasks (new feature, bug fix, or issue work), present a short plan and clarify open questions before editing.
- Prefer simple and efficient solutions that preserve long-term architecture.
- When troubleshooting external APIs, include `curl` commands the user can run locally.
- After changes, provide a short validation checklist or playbook.

## Branching and Release
- Work on `dev` by default. Do not commit, push, or merge to `main` unless explicitly instructed.
- Default post-change workflow (unless the user explicitly says not to commit yet): `git add .`, commit with a clear message, and push to remote `dev`.
- Update `CHANGELOG.md` only when changes are merged to `main`.
- Use `CHANGELOG.md` for cross-session context on shipped changes.

## Validation and Temp Files
- Baseline test command: `npm run test:e2e` (when relevant to the change).
- Use `/tmp/` for temporary logs/files created during development.
