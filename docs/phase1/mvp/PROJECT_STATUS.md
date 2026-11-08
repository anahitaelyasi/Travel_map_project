# Migration verification

- React static layout keeps **115/115 original HTML element IDs**, **380/380 class-bearing elements**, and **421/421 static DOM tags**.
- The original Persian text, RTL document direction, Tailwind utility classes, CSS rules, and Leaflet visual map configuration are retained; only OSM attribution and the compliant autocomplete provider are changed.
- Original inline event handlers are React event props, while dynamic legacy event markup remains supported by the migration controller.
- API routes rebuilt using FastAPI, SQLAlchemy and SQLite. Saved stations, profile changes, notifications, planned trips and signup birth date now persist.
- Both end-to-end backend test scenarios pass (`PYTHONPATH=. python -m pytest -q` in backend).
- JavaScript module syntax verified using `node --check`.
- **Not verified:** Vite compile and browser-level visual testing. Authoring runtime had no access to the npm registry; run `npm install && npm run build` in an internet-enabled environment and visually compare the original at your target viewport.
- **Public launch blockers:** Phone-only authentication needs OTP, production geocoder/tiles need a service and usage plan, VPS/DNS/SSL must be configured. Domain was not modified.
- **Missing source art:** Two original group avatar images were not supplied; replacements are marked in README.

## Matching hotfix

- The Hamsafar active-trip POST is no longer blocked by a failing road-routing request.
- Publishing validates the HTTP response; failures display an existing-style error toast and log a console error, with 15-second duplicate suppression.
- Traveler list fetching validates the HTTP response and data shape rather than masking failures as an empty list.
- Existing React markup, layout element IDs, and CSS have not been changed.
- Backend regression tests: 2 passing. Controller JavaScript syntax: passing. Browser end-to-end verification still required on the user's machine.

## Ride-request delivery correction (November 2026)

- Fixed the frontend sending the *group ID* as `receiver_id` instead of a recipient's *user ID* (`members[0].id`).
- Request UI now changes from "sending" to "sent" only after a successful FastAPI response with an integer `request_id`; failed requests show an error and enable retry.
- Outgoing request status and cancellation are keyed by actual recipient user ID, and incoming requests poll while the Hamsafar panel is closed.
- The original React component markup, CSS and visual layout are untouched.
- Tests: backend 2 passing; frontend 3 passing; JavaScript syntax check passing. Browser end-to-end verification remains for the user's two-browser session.

## Latest: Temporary versus permanent group lifecycle (2026-11-06)

Updated FastAPI `main.py`, request schema and React compatibility controller so logout removes temporary-group membership, conversion dissolves the temporary group and migrates messages, permanent groups persist, and join requests for permanent groups are handled in the permanent chat. Startup migrates legacy `active_group_id` records once. Static JSX and styles are unchanged. Tests: 7 FastAPI and 6 Node tests passed; browser visual testing and npm build remain unverified.

## Latest verification

- 7 backend FastAPI regression tests passing, including logout cleanup, conversion of existing groups, in-chat permanent join requests, stale-record recovery, and conversion of already-pending requests.
- 6 Node request-flow checks passing; controller JavaScript syntax and FastAPI syntax verified.
- Unchanged React JSX and original CSS relative to the previous package.
- Vite build unverified: dependencies unavailable in the offline npm cache.
- Windows SQLite backup and upgrade instructions provided in UPGRADE_WINDOWS.md.
