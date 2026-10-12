# AGENTS.md

## Project overview

This workspace contains a small static frontend for searching a Dota 2 player and showing the results of the last ten processed matches.

Key files:
- [analisis/README.md](analisis/README.md) — product description, runtime notes, and OpenDota behavior.
- [analisis/index.html](analisis/index.html) — page structure and DOM IDs used by the JS.
- [analisis/app.js](analisis/app.js) — business logic and API calls.
- [analisis/styles.css](analisis/styles.css) — presentation and layout.

## Working conventions

- This is a static web app; do not introduce a framework, bundler, or backend unless explicitly requested.
- Run it locally through a simple HTTP server, not by opening the HTML file directly:
  ```powershell
  python -m http.server 8000
  ```
  Then open http://localhost:8000.
- Keep the app compatible with browser fetch calls to the public OpenDota API.
- Preserve the existing Spanish user-facing text and UI terminology unless there is a clear reason to change it.
- Keep DOM IDs and selectors aligned with the HTML file; many UI updates rely on them.

## Data and API behavior

- The app accepts either:
  - a Steam32/account ID, or
  - an exact name match as shown in OpenDota.
- Name queries are case-insensitive and trim surrounding whitespace, but they are not partial-match searches.
- The app fetches:
  - `/players/{account_id}`
  - `/players/{account_id}/matches?limit=10`
  - `/search?q={name}`
- Existing error handling should remain consistent for rate limiting (429), missing profiles (404), and generic API failures.
- Do not assume additional backend caching or proxy layers exist; the frontend calls OpenDota directly.

## Editing guidance

- Prefer small, targeted changes in [analisis/app.js](analisis/app.js) and related markup/styles.
- If you change request logic, keep the current behavior for exact-name resolution and the hero aggregation logic.
- If you add UI states, reuse the existing `statusPanel`, `formMessage`, `emptyState`, and result containers rather than inventing a new pattern.
- Keep calculations transparent and match the README descriptions, especially for win-rate and recent-match limits.

## Constraints

- Do not hard-code unsupported SteamID64 flows or broaden the search beyond exact-name matching without updating the docs.
- Do not silently add production-only assumptions such as auth, proxying, or caching unless the task explicitly requires it.
- Favor minimal changes that preserve the current static-site architecture and browser-only behavior.
