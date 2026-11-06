# Nimrah — React + FastAPI + SQLite MVP

A migration of the supplied `index.html` and `server.js` to a maintainable full-stack project while **preserving the original Persian RTL markup, Tailwind classes, layouts, panels, and icons**. No visual redesign is intended.

## Structure

- `frontend/src/components/OriginalLayout.jsx` — 14 React components generated from the original HTML elements; original DOM structure, text, ids, classes and inline styles retained.
- `frontend/src/legacy/controller.js` — the existing Leaflet, routing, matching, chat and UI business logic, initialized inside the React lifecycle. This is a **compatibility layer**, not yet a complete idiomatic React-hooks rewrite. This was chosen to avoid inadvertently changing the UI during MVP migration.
- `frontend/src/tailwind.css` and `frontend/src/original.css` — Tailwind plus the original custom CSS, loaded in the original stylesheet order. Leaflet 1.9.4 and Font Awesome 6.4.0 are npm dependencies matching the original versions.
- `backend/app/main.py` — FastAPI endpoints with compatible `/api` paths and JSON response structures.
- `backend/app/models.py` — SQLAlchemy models, `backend/app/database.py` — persistent SQLite.
- `backend/tests/test_api.py` — HTTP API regression tests using a temporary SQLite database.
- `Dockerfile`, `docker-compose.yml`, `deployment/nimrah.ir.nginx.conf` — a one-domain deployment scaffold.
- `deployment/original-*` — untouched uploads retained for reference only.

## Run locally

Requirements: Python 3.11+ and Node.js 20+ with npm. Open **two terminals**.

**Terminal 1 (backend):**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 (React frontend):**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite forwards `/api` to `http://127.0.0.1:8000`. Backend API docs: `http://127.0.0.1:8000/api/docs`; readiness check: `/api/health`. The SQLite file is created in `backend/data/nimrah.sqlite3`. It is not committed. No existing database was uploaded, so original user records cannot be imported automatically.

To test the API:

```bash
cd backend
python -m pip install pytest httpx
PYTHONPATH=. python -m pytest -q
```

## Deploy to nimrah.ir (example: Ubuntu VPS)

Owning the domain alone is not enough to host the app: you also need a VPS or hosting service and access to your DNS management. There is **no live deployment** or DNS change in this delivery.

1. Rent/provision an Ubuntu server with a public IPv4 address; point the DNS **A** record for `@` to that IP and another **A** record for `www` (or a CNAME pointing `www` to `nimrah.ir`). Allow ports 80 and 443. Remove conflicting records if appropriate.
2. Install Docker Engine + Compose plugin, Nginx, and Certbot (`python3-certbot-nginx`). Upload the project, then run `docker compose up --build -d` at the project root. This builds the React app, serves it with FastAPI, and persists SQLite in the `nimrah-data` Docker volume.
3. Copy `deployment/nimrah.ir.nginx.conf` to `/etc/nginx/sites-available/nimrah.ir`; symlink it into `/etc/nginx/sites-enabled/`. Run `sudo nginx -t && sudo systemctl reload nginx`.
4. When DNS resolves correctly, run `sudo certbot --nginx -d nimrah.ir -d www.nimrah.ir` to issue HTTPS and configure certificate renewals.
5. Open `https://nimrah.ir` and `https://nimrah.ir/api/health`. HTTPS is essential for browser geolocation.

**Back up SQLite**: `docker compose exec -T web python -c "import sqlite3; source=sqlite3.connect('/data/nimrah.sqlite3'); dest=sqlite3.connect('/data/nimrah-backup.sqlite3'); source.backup(dest); dest.close(); source.close()"`. Copy backups off the server regularly. Do not serve more than one writable SQLite app instance without revisiting concurrency and storage.

## Important before public launch

1. **Authentication is not production safe.** The original login only asks for a phone number. Tokens and per-user authorization have been added, but anyone knowing another user's number can still log in as that user. Integrate a real Iranian SMS OTP provider with verification, resend limits and anti-abuse, using the same modal design, before allowing real users or sensitive location data onto `nimrah.ir`.
2. **Public geocoding providers have restrictions.** The original used public Nominatim for autocomplete, which is explicitly forbidden. Autocomplete now uses Photon's public *demo* endpoint (`photon.komoot.io`), with per-client throttling; production use should switch to a paid or self-hosted search service. No visual changes are required for this swap. Public OpenStreetMap tiles have acceptable-use, caching, attribution and capacity rules. Neither demo tiles nor community geocoders have an uptime SLA.
3. **Some original UI actions were placeholders**, such as public-transport routing, photo contributions and menu buttons. They are intentionally not redesigned or falsely presented as implemented.
4. **Two original group-avatar image assets were missing** from the supplied upload (`two_users.jpg`, `three_users.png`). Neutral, visually modest replacement icons are included so group avatars do not show as broken images. Replace them with the original files in `frontend/public/` for an exact match.
5. Leaflet and Font Awesome are bundled locally with Vite, reducing external CDN dependencies. Routing depends on public OSRM instances with usage limits.
6. Tests were run against the FastAPI endpoints; the frontend build requires `npm install` in an internet-enabled environment and could not be executed in the isolated authoring environment. Do a visual regression check in a browser at the same viewport size before launch.

## Why not make every UI interaction a React hook immediately?

The original code has over 2,000 lines of imperative UI state, Leaflet integration and dynamically generated chat markup. A total rewrite is more likely to cause the exact design regressions you explicitly do not want. This project uses a **genuine React component tree** for the static HTML and a separately contained compatibility controller for the existing event-driven behavior. You can gradually replace that controller with hooks while retaining the same DOM/CSS.

## Traveler matching hotfix (November 2026)

If two signed-in browsers show only one entry in `active_travelers`, the other
user is not publishing an active trip. Both browsers must select **actual map
coordinates** for origin and destination in **همسفر**, and use the same travel
mode (both **همین الان** for the simplest test). Text typed into an input does
not count as a selected map location.

The controller now publishes a selected trip independently of OSRM routing,
checks the POST response status, and shows backend errors using the existing
toast UI (rate-limited to avoid messages every three seconds). Traveler-list
GET errors also appear instead of silently hiding. The static React layout and
all styling remain unchanged.

To debug in either browser, open Developer Tools → Console and run
`window.bothFilled()`; it must return `true` after selecting real locations.
With both places selected, run `await window.publishTraveler()` to explicitly
save that account's trip (`true` on success, `false` if not). A failed save
should now explain itself in a toast and the browser Console.

From the `backend` directory, inspect your local data file with:

```powershell
python -c "import sqlite3; c=sqlite3.connect('data/nimrah.sqlite3'); print(c.execute('SELECT user_id, name, travel_mode FROM active_travelers').fetchall()); c.close()"
```

When updating an existing local installation, replace **only**
`frontend/src/legacy/controller.js`, restart `npm run dev` if necessary, and
hard-refresh both browsers with `Ctrl+Shift+R`. There is no database migration
or backend reinstall for this hotfix.

## Ride-request delivery fix (November 2026)

The Hamsafar search response exposes a synthetic `group.id` and real user IDs in `group.members[].id`.
Older frontend versions accidentally sent `group.id` in the `POST /api/requests` `receiver_id` field. The
backend correctly rejected it, but the frontend incorrectly displayed a pending confirmation. The
controller now sends a real member ID, checks the HTTP status and request ID before marking a request
sent, preserves cancellation and acceptance polling, and checks incoming requests every three seconds
even when the Hamsafar sidebar is closed. The existing Persian UI/CSS is unchanged.

To upgrade an existing local checkout **without changing any local SQLite data**, replace only
`frontend/src/legacy/controller.js` with the updated file, then refresh both browsers. The old
"waiting" banner represented a failed HTTP request, so send a new request after the upgrade.

Regression checks:

```bash
node --test frontend/tests/request-flow.test.mjs
cd backend && python -m pytest tests/test_api.py -q
```

## Group lifecycle correction (November 2026)

This version implements **two distinct group lifetimes** without changing the original HTML, CSS, React layout, icons, colors, or map controls.

- **Temporary group (همسفر)**: the `active_travelers` group relationship and temporary messages are session/trip-specific. Explicit logout or new login removes the user's temporary trip and cancels pending temporary requests; if a group is reduced to one traveler, its old chat is dissolved and the remaining user returns to an individual traveler. A fresh login never restores old temporary chat membership.
- **Permanent group (گروه‌ها)**: `perm_groups` and `perm_group_members` persist across logout and login. Converting an active multi-person temporary group moves its user chat history into the permanent group, transfers pending join requests to that group, and dissolves the temporary group immediately. Permanent members retain their group even when not currently matching for trips.
- **Joining permanent groups**: matching results show an advertised permanent group **as one group** with all members. New join requests carry `perm_group_id` and appear inside the *permanent chat*, where any existing member can accept or reject. Acceptance adds permanent membership and does not recreate a temporary chat.
- **Discovery**: a permanent group appears in current-trip matches only while at least one member has a recent published matching route (45-second heartbeat for Now trips), but its membership persists indefinitely. Scheduled-trip matching remains date-based.
- **Compatibility migration**: on startup FastAPI converts any old `perm_groups.active_group_id` links to the new data lifecycle automatically. Migration moves old temporary messages to the permanent group, keeps permanent members, clears former temporary group affiliations, and cleans up inactive legacy traveler records with no recent presence heartbeat. No database reset is required.

**Important—back up your local SQLite database before running this updated backend.** Stop FastAPI, then from your project root in PowerShell run:

```powershell
Copy-Item .\backend\data\nimrah.sqlite3 .\backend\data\nimrah-before-lifecycle-fix.sqlite3
```

After copying the new files, start FastAPI and Vite as usual. The backend runs the one-time compatibility migration when it starts. To confirm the new behavior, test Ana/Sara temporary matching and chat; convert to permanent; verify the old temporary tab is empty and the permanent tab retains their messages; log in as Mahan, publish a trip, request the displayed permanent group, and accept via the permanent chat; log out and in again to verify only permanent membership remains.

**Testing:** seven FastAPI lifecycle and migration tests and six JavaScript request-flow checks pass. Vite production build/browser visual comparison is **not verified** in this environment because the npm dependency cache was incomplete. The React JSX and CSS files were intentionally left unchanged.

For detailed Windows/VS Code upgrade steps that preserve your existing SQLite data, see **UPGRADE_WINDOWS.md**.
