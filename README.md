# Game Club

## D1 environments

This project uses explicit Wrangler environments for D1 to avoid accidental prod changes.

- Preferred migration commands:
  - Dev: `npm run db:migrate:dev`
  - Prod: `npm run db:migrate:prod`
- Equivalent direct Wrangler commands:
  - Dev: `npx wrangler d1 migrations apply game-club-dev --remote --env dev`
  - Prod: `npx wrangler d1 migrations apply game-club --remote --env production`
- Fresh rebuild snapshot (alternative to replaying all historical migrations):
  - Dev: `npm run db:bootstrap:dev`
  - Prod: `npm run db:bootstrap:prod`
  - Snapshot file: `schema/bootstrap.sql`
  - Important: bootstrap is for a new/empty database and should not be followed by re-running old numbered migrations.

Lightweight, invite-only site for a monthly video game club. Members can submit
games, vote on the next pick, and track the current and previously played games.

## Stack
- Astro (frontend)
- Cloudflare Pages + Pages Functions (API)
- Google OAuth (Authorization Code + PKCE)
- Cloudflare D1 (SQLite) for data
- IsThereAnyDeal (prices)

## Development
```bash
npm install
npm run dev
```

## Google OAuth
- Set the variables in `.env.example` in a local `.env` file.
- Configure the same values in Cloudflare Pages environment variables.
- Redirect URI should be `/api/auth/callback` on your chosen domain.

## IsThereAnyDeal (prices)
- Set `ITAD_API_KEY` in local `.env` and in Pages environment variables.
- Prices are pulled when a game is added and via a scheduled sync worker.

## Scheduled price sync
Deploy the worker defined in `wrangler.itad-sync.toml`:
```bash
npx wrangler deploy -c wrangler.itad-sync.toml
npx wrangler secret put ITAD_API_KEY -c wrangler.itad-sync.toml
```

## Members (D1)
- OAuth checks the `members` table in D1 first.
- Initial migration: `migrations/0001_members.sql`.
- Full current schema snapshot: `schema/bootstrap.sql`.

## Project Docs
- `PROJECT_BRIEF.md` is the authoritative project context and decision record
- `AGENTS.md` contains agent workflow and operational guardrails

## Repo Layout
- `src/pages/` Astro pages (routes)
- `public/` static assets
