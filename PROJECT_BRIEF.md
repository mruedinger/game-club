# Game Club — Project Brief

## File Usage
Primary project context and decision record. Keep the file updated as key decisions are made or as intent is clarified.
Agent workflow/operational guardrails live in `AGENTS.md`.

## Vision
This project maintains a website that is a companion tool for a video game club (similar to a traditional book club). The club meets regularly to discuss their thoughts on a game, then select a new game to play. The site provides an all-in-one place to manage the game backlog, view game info, create polls, and leave reviews.

## Core Features (current scope)
- Auth: Google OAuth. Admins manage the authorized user list in D1 (invite-only).
- Roles: Members, Admins.
- Members: Can perform most actions, including adding games to the backlog and managing polls.
- Admins: Can perform all Member functions. Additionally, they can manage the user list, and may have other superuser permissions across the site.
- Non-members: Membership is invite-only, but unauthenticated users can view poll results and games, but not vote or submit (read-only).
- Games: Members can submit games to a backlog. Metadata will be pulled in when a game is submitted. Games can be in one of 3 states: backlog, current (only 1 at a time), or played (was previously a current game).
- Favorites: Members can privately tag games as favorites (heart icon) to help prioritize voting; favorite indicators appear in backlog, game details, and poll choices for that member.
- Ratings: Members can rate any game on a 1-5 star scale, can clear/update their own rating, and can view aggregate ratings site-wide. Individual member ratings are visible in the game detail modal for authenticated members.
- Polls: One active poll at a time, ranked choice voting (top 3). Polls include only backlog games marked poll-eligible.
- Poll eligibility: Members can mark up to 2 of their own backlog games as poll-eligible. Existing/new backlog games default to ineligible until explicitly marked.
- Poll history: Track lifetime backlog points from closed polls only. Polls with at least 3 unique voters are automatically valid for history, and admins can override validity in Admin > Poll History.

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
- When tradeoffs exist, prioritize long-term correct architecture over short-term quick fixes.
- Strongly prefer free services and solutions when implementing features.
- Centralized UI styles: All colors/themes/spacing/typography/etc MUST be consistent across the site, and maintained in `src/styles/base.css`.
- User display priority: When displaying a user's name on the site, prefer this order: Alias > First Name > "Member".
- Privacy: Never expose member email addresses to unauthenticated/public users.
- Member deletion policy: Hard-delete members only when they have no submitted games; otherwise deactivate (`active=0`) and require game reassignment/removal before deletion.
- Auth sessions: Sliding session with 45-day idle timeout, 180-day absolute lifetime, and 60-minute membership/role revalidation window.
- DB invariants: Enforce single current game, single active poll, and unique game identity (normalized title + Steam app id when present) at schema level.
- External API reliability: Use bounded timeouts with limited retry/backoff for third-party API calls to avoid long-hanging requests.
- Metadata - Time to Beat: Use ITAD game page bootstrap `detail.hltb.all` as the HLTB source, store raw value as seconds in `games.time_to_beat_seconds`, and store `NULL` when unavailable (no fallback source).
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

## Agent Notes
- See `AGENTS.md` for agent workflow and operational guardrails.
- Keep this brief focused on product context, scope, and architecture decisions.
