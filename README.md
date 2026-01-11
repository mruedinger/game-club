# Game Club

## D1 environments

This project uses explicit Wrangler environments for D1 to avoid accidental prod changes.

- Dev migrations:
  - `npx wrangler d1 migrations apply game-club-dev --remote --env dev`
- Prod migrations:
  - `npx wrangler d1 migrations apply game-club --remote --env production`

Lightweight, invite-only site for a monthly video game club. Members can submit
games, vote on the next pick, and track the current and previously played games.

## Stack
- Astro (frontend)
- Cloudflare Pages + Pages Functions (API)
- Cloudflare Access (Google) for invite-only auth
- Cloudflare D1 (SQLite) for data

## Development
```bash
npm install
npm run dev
```

## Google OAuth
- Set the variables in `.env.example` in a local `.env` file.
- Configure the same values in Cloudflare Pages environment variables.
- Redirect URI should be `/api/auth/callback` on your chosen domain.

## Members (D1)
- OAuth checks the `members` table in D1 first.
- Migration file: `migrations/0001_members.sql`.

## Project Docs
- `ARCHITECTURE.md` for platform and data model notes
- `BACKLOG.md` for prioritized work items

## Repo Layout
- `src/pages/` Astro pages (routes)
- `public/` static assets
