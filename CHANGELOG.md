# Changelog

## 2026-02-10
1. Added private per-member game favorites with heart toggles in the backlog table and game detail modal.
2. Added favorite indicators to active poll game choices so members can see their own favorites while voting.
3. Added `game_favorites` schema support in bootstrap + migration and wired favorite cleanup into game deletion.
4. Added new favorites API endpoint (`POST /api/games/favorite`) with auth, validation, and audit logging.
5. Updated games and polls payloads to include per-member favorite state and aligned `/api/games` caching to private/no-store.
6. Expanded E2E coverage for favorite auth guard and payload validation paths.
7. Added game ratings persistence (`game_ratings`) with migration support and per-game aggregate metrics.
8. Added ratings API (`/api/games/rating`) supporting set/update/clear and authenticated member-rating detail retrieval.
9. Added aggregate rating display on current and played cards, plus full rating UI in game detail modal (aggregate, self-rating controls, member rating list for signed-in users).
10. Expanded E2E coverage for ratings auth guard and payload validation paths.
11. Refined ratings UX for compactness: removed redundant detail footer Close button, moved rating input into a dedicated Rate modal, added rate actions to current-card/detail footer, and switched individual member ratings in detail to an on-hover aggregate popover.
12. Added poll eligibility controls with a per-member cap of 2 backlog games, including new `poll_eligible` schema support (bootstrap + migration) and seeding existing backlog games to ineligible.
13. Updated poll start logic to include only poll-eligible backlog games and return a clear error when none are eligible.
14. Added member poll-eligibility management on Home via game detail toggle and a dedicated eligibility modal, with disabled state and server errors when the 2-game cap is reached.
15. Added admin poll-eligibility editing in the game editor modal, including cap enforcement when changing submitter/status/eligibility.
16. Added start-poll confirmation prompt and backlog UX updates for eligibility (eligible-first sorting and ineligible row fade).
17. Expanded E2E guard coverage for the new `/api/games/eligibility` endpoint.

## 2026-02-09
1. Moved games page content to the Home page and removed the separate Games page flow.
2. Hardened session revocation behavior with a sliding session model, periodic membership/role revalidation, and middleware-driven cookie refresh.
3. Removed public submitter email exposure from game payloads/UI and aligned response behavior with the privacy decision.
4. Enforced DB-level integrity invariants for single current game, single active poll, and unique game identity constraints.
5. Converted critical multi-step game/poll write paths to atomic D1 batch operations to reduce partial-update risk.
6. Fixed `set-current` correctness and stale-state UX by returning `404` for missing targets and showing user-visible stale-action feedback.
7. Switched session cookie payload decode to UTF-8-safe decoding.
8. Aligned display-name behavior with project policy: alias, then first name, then `Member`; never expose member email publicly.
9. Removed redundant Home auth/game fetch patterns to reduce duplicate requests.
10. Standardized `price_checked_at` handling to DB datetime format.
11. Added bounded timeout/retry behavior for external API calls (Steam, IGDB, ITAD paths).
12. Added strict server-side validation for admin game edit fields (submitter email and played month).
13. Guarded SSR render paths against malformed tags JSON payloads.
14. Fixed search suggestion race behavior using request cancellation/versioning.
15. Updated member deletion behavior: hard-delete only when no games are assigned; otherwise deactivate and return explicit reassignment guidance.
16. Reviewed Time-to-Beat permission scope and intentionally kept broad member access (policy decision).
17. Consolidated Wrangler config to `wrangler.jsonc`.
18. Removed stale architecture/decisions docs and aligned docs around `PROJECT_BRIEF.md` + `README.md`.
19. Expanded E2E harness with auto-start web server and broader unauthenticated guard/smoke coverage.
20. Added `.cache/` to `.gitignore` for local Playwright/browser artifact cleanup.
21. Tightened admin member email validation to reject malformed addresses server-side.
22. Neutralized stale seeded meeting defaults by resetting legacy seed values and using a neutral bootstrap default.
23. Reduced production dependency audit surface by scoping the Astro Cloudflare adapter to dev dependencies; `npm audit --omit=dev` now reports zero vulnerabilities.
24. Added authenticated E2E auth/authz coverage using signed session-cookie fixtures for member/admin route checks.

## Notes
1. This file tracks high-level implemented changes, including audit remediations from the 2026-02-06 baseline and the 2026-02-09 follow-up audit.
2. Intentionally deferred item: CSS `.game-title` naming collision remains unchanged by design preference.
