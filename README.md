# Game Club

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

## Project Docs
- `ARCHITECTURE.md` for platform and data model notes
- `BACKLOG.md` for prioritized work items

## Repo Layout
- `src/pages/` Astro pages (routes)
- `public/` static assets
