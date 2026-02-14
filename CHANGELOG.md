# Changelog

## 2026-02-14
1. Implemented Backlog issue #4 by adding automatic Home poll-state refresh without manual browser reload.
2. Added visibility-aware poll refresh cadence on Home: active polls refresh every 2 seconds, inactive polls refresh every 30 seconds, and hidden tabs pause polling until visible again.
3. Added a client-side in-flight request guard for poll-state reads to prevent overlapping `/api/polls` fetches and stale UI races.
4. Added cache-safety controls for poll state reads by using `fetch(..., { cache: "no-store" })` on the client and `Cache-Control: no-store, no-cache, must-revalidate` on `/api/polls` responses.
5. Updated active poll UI for members who already voted to show vote counts (`Votes in: N`) instead of the prior `Current standings:` label.
6. Extended `/api/polls` active payloads with `voterCount` so clients can render live vote totals.
7. Fixed cross-session poll activation behavior so users who have not voted always receive populated poll-choice dropdowns after state changes from inactive to active.

## 2026-02-12
1. Completed Backlog issue #5 by replacing IGDB Time to Beat ingestion with ITAD game page bootstrap HLTB data (`detail.hltb.all`) and storing raw seconds in `games.time_to_beat_seconds`.
2. Updated game metadata ingest and admin metadata refresh paths to write HLTB seconds with no fallback source; missing/unavailable values now persist as `NULL`.
3. Migrated all API payloads, SQL reads/writes, and Home/Admin TTB display/edit math from minutes-based handling to seconds-based storage while preserving hour-based UI presentation.
4. Added and applied schema migrations to introduce/backfill `time_to_beat_seconds` and then remove the legacy `time_to_beat_minutes` column from the `games` table.
5. Updated project policy notes in `PROJECT_BRIEF.md` to codify ITAD bootstrap HLTB sourcing, seconds storage, and null-on-missing behavior.

## 2026-02-11
1. Implemented Backlog issue #9 UI updates across Home/Admin views: smaller Steam/HLTB/ITAD pills, backlog header label updates (`Fav`, `Rating`, `TTB`), quarter-hour TTB formatting (`10 h`, `10½ h`) on backlog/current/detail, `GOTM` detail action label with tooltip, and admin game-modal footer cleanup (removed redundant Cancel button).
2. Updated backlog rating column display to use Steam review score format (`x/9`) while keeping review descriptions on the current card and game detail modal.
3. Expanded backlog row hover tooltip content to include submitter alias/name under tags.
4. Removed the backlog `Submitter` table column from the Home page view while keeping submitter context in the hover tooltip.
5. Updated project operating policies in `PROJECT_BRIEF.md`: planning-first workflow for substantial tasks and `CHANGELOG.md` updates only when merging to `main`.
6. Updated smoke/manual test expectations to align backlog terminology (`Rating`).

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
18. Refreshed dependency lock state and bumped direct `wrangler` devDependency range to `^4.64.0`; build and E2E checks pass on updated toolchain.
19. Added poll history validity support in schema/bootstrap + migration, with default validity seeded from unique voter count (`>=3` valid).
20. Updated poll close behavior to automatically set poll history validity based on unique voter count at close time.
21. Added lifetime backlog points aggregation sourced from closed valid polls only, surfaced as a new backlog table column.
22. Added admin Poll History API (`/api/admin/polls`) with list/detail payloads and controls to toggle validity or delete closed poll history entries.
23. Added Admin page Poll History section and detail modal for inspecting winners/results/voter count and managing validity/deletion.
24. Expanded E2E coverage for unauthenticated/admin-forbidden access to the new poll history admin endpoint.
25. Refined Admin Poll History modal UX: removed redundant footer Close/Save buttons and switched validity updates to autosave when toggled.
26. Added Steam review persistence fields (`steam_review_score`, `steam_review_desc`) to bootstrap schema + migration and ingested them from Steam `appreviews` at game creation time.
27. Updated home-game payloads (`/api/games`, `/api/games/current`) to include Steam review score/description.
28. Replaced backlog `MC Score` with `Reviews`, sorting by numeric Steam review score while displaying the familiar Steam review description.
29. Updated current card and game detail metadata line order to `tags | ttb | review description` using Steam review labels.
30. Updated smoke/manual test coverage to validate the `Reviews` column and Steam review metadata behavior.
31. Added shared external game metadata fetcher (`src/lib/game-metadata.ts`) and parallelized Steam details/reviews, ITAD lookup/prices, and IGDB TTB fetch flow per game.
32. Updated game-add ingestion to use the shared metadata fetcher so add-game metadata calls run in parallel and stay aligned with admin refresh logic.
33. Added admin metadata refresh actions to `/api/admin/games`: refresh one game or refresh all games, with all-games processing capped at concurrency 3.
34. Added admin UI controls for metadata refresh (single-game in modal + refresh-all button) with overwrite confirmation dialogs and run status messaging.
35. Expanded E2E guard/validation coverage and manual test checklist for the new admin metadata refresh paths.
36. Hardened bulk metadata refresh reliability by serializing DB writes and adding retry/backoff for transient refresh failures while keeping fetch concurrency capped at 3.
37. Converted admin refresh-all to cursor-based batching and client-side batch iteration so large metadata refreshes complete via multiple short requests instead of one long request.
38. Increased bulk metadata refresh fetch concurrency back to 10 after batching/queued-write safeguards were in place.
39. Increased bulk metadata refresh batch size from 5 to 10 games per request to improve throughput while keeping cursor-based batching.
40. Reduced bulk metadata refresh fetch concurrency and batch size back to 5 after upstream limits impacted metadata completeness at higher settings.
41. Further reduced bulk metadata refresh fetch concurrency to 3 to mitigate transient TTB/IGDB misses while preserving current null-overwrite behavior.
42. Switched bulk metadata refresh to serial game processing (`concurrency = 1`) and reduced batch size to 3 to minimize IGDB concurrent pressure while keeping null-overwrite behavior.

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
