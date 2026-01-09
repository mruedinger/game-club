# Game Club Architecture

## Goals
- Lightweight, invite-only web app.
- Desktop + mobile friendly.
- Minimal dependencies and hosting complexity.

## Platform
- Hosting: Cloudflare Pages.
- Auth: Google OAuth (Authorization Code + PKCE).
- API: Cloudflare Pages Functions (TypeScript).
- Data: Cloudflare D1 (SQLite).

## Auth & Admin
- OAuth login uses Google accounts with a strict membership allowlist.
- Sessions are stored in a signed, HttpOnly cookie.
- Admin-only routes check a `role` stored on the member record.

## D1 Members
- Table: `members` with `email`, `name`, `role`, `active`.
- OAuth checks D1 first; env allowlists are a fallback until members are migrated.

## Core Entities (Draft)
- users: email, display_name, created_at, is_member, is_admin
- games: title, submitted_by, status (candidate|active|played), metadata_json
- polls: created_by, status (active|closed|archived), created_at, closed_at
- poll_options: poll_id, game_id
- votes: poll_id, user_id, game_id, created_at
- confirmations: poll_id, user_id, confirmed_at
- audit_logs: user_id, action, target_type, target_id, created_at

## Key Rules
- Single active poll at a time.
- Any authenticated user can start or close a poll.
- Voting: up to 3 selections per user per poll, equal weight for now.
- Poll ends when all members vote or when closed.
- Winner requires 2 confirmations to become current game (admin override allowed).
- Admin can delete games submitted by others.

## Notes
- If everyone becomes admin later, widen the admin allowlist or remove role checks.
