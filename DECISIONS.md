# Decisions

## 2026-01-06
- Auth: Use Cloudflare Access (Google) for invite-only gating.
  - Reason: Minimal auth plumbing, low maintenance, and meets invite-only needs.

## 2026-01-07
- Frontend: Astro with minimal template.
  - Reason: Lightweight, efficient, and easy to extend.
- Backend: Cloudflare Pages Functions (TypeScript) + D1 (SQLite).
  - Reason: Native to Cloudflare Pages, free tier friendly, low complexity.
- Roles: Admin-only functions for now (member management, content edits, audit logs, delete others' games).
  - Reason: Early-stage control while the product stabilizes.
- Voting: Up to 3 selections per user, equal weight.
  - Reason: Simple MVP flow; leaves room for weighted voting later.

## 2026-01-08
- Auth: Switch to Google OAuth (Authorization Code + PKCE) with allowlists.
  - Reason: Hosting-agnostic, simpler multi-project user management.
