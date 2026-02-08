# Game Club — Project Brief

## File Usage
Primarily used as a session-starter brief to provide key context and intent to AI agents (e.g. codex, claude) at the start of a session. Keep the file updated as key decisions are made or as intent is clarified.

## Vision
This project maintains a website that is a companion tool for a video game club (similar to a traditional book club). The club meets regularly to discuss their thoughts on a game, then select a new game to play. The site provides an all-in-one place to manage the game backlog, view game info, create polls, and leave reviews.

## Core Features (current scope)
- Auth: Google OAuth. Admins manage the authorized user list in D1 (invite-only).
- Roles: Members, Admins.
- Members: Can perform most actions, including adding games to the backlog and managing polls.
- Admins: Can perform all Member functions. Additionally, they can manage the user list, and may have other superuser permissions across the site.
- Non-members: Membership is invite-only, but unauthenticated users can view poll results and games, but not vote or submit (read-only).
- Games: Members can submit games to a backlog. Metadata will be pulled in when a game is submitted. Games can be in one of 3 states: backlog, current (only 1 at a time), or played (was previously a current game).
- Polls: One active poll at a time, ranked choice voting (top 3).

## Tech Stack
- Frontend: Astro
- Backend: Astro endpoints on Cloudflare Pages
- DB: Cloudflare D1
- Hosting: Cloudflare Pages (dev + prod)
- Language: TS for functions; JS in Astro pages

## Key Decisions
- Design for desktop first while remaining functional on mobile.
- Prefer latest stable apps/tools/libraries/frameworks/etc. i.e., avoid version locking to an older library or software release.
- Strongly prefer simple and efficient solutions when implementing features.
- Strongly prefer free services and solutions when implementing features.
- Centralized UI styles: All colors/themes/spacing/typography/etc MUST be consistent across the site, and maintained in `src/styles/base.css`.
- User display priority: When displaying a user's name on the site, prefer this order: Alias > First Name > "Member".
- Privacy: Never expose member email addresses to unauthenticated/public users.
- Auth sessions: Sliding session with 45-day idle timeout, 180-day absolute lifetime, and 60-minute membership/role revalidation window.
- DB invariants: Enforce single current game, single active poll, and unique game identity (normalized title + Steam app id when present) at schema level.
- Metadata - Time to Beat: HowLongToBeat (HLTB) is the preferred data source, but IGDB can be used if HLTB is not possible.
- Metadata - Boxart: Pull from IsThereAnyDeal (ITAD)
- Metadata - Pricing: Pull from IsThereAnyDeal (ITAD)
- Metadata - All other: Prefer Steam

## Admin Features
- Member management (roles: admin/member)
- Games data super-editor
- Audit log viewer

## UI Conventions
- Header + footer shared across pages
- Modals styled in `base.css`
- Tooltips must use consistent styling
- All buttons consistent with home page theme
- Error feedback pattern:
  - Prefer page-level inline error banners near the action origin using shared error styling (`.form-error`) and `role="alert"`.
  - For stale/race modal actions (e.g. target deleted in another tab), close the modal, show page-level error, and auto-refresh after 1800ms.
  - For non-stale errors, keep message visible until the next user action.

## Operational Notes for AI Agents
- Always develop on `dev` branch. Do not add/commit/push/merge to `main` or any other branch unless explicitly told to do so.
- Mandatory default workflow after making file changes (unless user explicitly says not to commit yet):
  - Validate current branch is `dev` (or user-specified branch).
  - Stage all intended changes with `git add .`.
  - Create a commit with a clear message.
  - Push that commit to the remote `dev` branch.
  - Do not leave local modifications unstaged or uncommitted at handoff.
- Changes to the dev branch will be automatically deployed to cloudflare pages dev deployment
- Changes to the main branch will be automatically deployed to cloudflare pages production deployment
- When troubleshooting problems involving external apis, provide the user with curl commands to test & troubleshoot locally
- After changes: Give user a checklist/playbook (or a script when appropriate) to validate functionality after changes
- Use /tmp/ for temporary file storage during devlopment (e.g. logs or files for inspection)
- Update this file, when appropriate, to ensure key context and decisions are available in new chat sessions
