# Nimrah update — Windows / VS Code (preserve your existing accounts)

This release fixes temporary-versus-permanent group behavior. **It does not change the static React markup, Tailwind classes, CSS, or map design.**

## Before replacing the files

1. Close your Vite and FastAPI terminals with `Ctrl+C`. Keep the old project folder until the new one works.
2. Open PowerShell at `D:\all_my_codes\nimrah_project` and back up the SQLite database **while the backend is stopped**:

   ```powershell
   cd D:\all_my_codes\nimrah_project
   Copy-Item .\backend\data\nimrah.sqlite3 .\backend\data\nimrah-before-group-fix.sqlite3
   ```

   If you do not yet have a database file, skip the copy.
3. Extract the update ZIP, then copy the updated code into your existing `nimrah_project` folder. **Do not delete, replace, or reset `backend\data\nimrah.sqlite3`**. Do not remove `frontend\node_modules` or `backend\.venv`.

   If using the *code-only patch* ZIP, extract it directly into `D:\all_my_codes\nimrah_project` and allow overwriting the supplied source files. The patch contains no database or local environment files.

## Restart in two VS Code terminals

**FastAPI terminal** (Python virtual environment already configured):

```powershell
cd D:\all_my_codes\nimrah_project\backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --port 8000
```

**React terminal**:

```powershell
cd D:\all_my_codes\nimrah_project\frontend
npm run dev
```

Visit `http://localhost:5173` and hard-refresh your browser (`Ctrl+Shift+R`).

## What has changed?

- **Logout**: removes your temporary trip and participation in the temporary chat; existing permanent memberships and permanent messages remain.
- **Login**: cannot restore your old temporary group. You must start a new Hamsafar trip to be matched again.
- **Convert to permanent**: transfers chat messages and pending joining requests to the permanent group, and dissolves the original temporary chat. The permanent group appears in **گروه‌ها**.
- **Third person requests a permanent group**: the request appears inside that permanent group chat, with accept/reject controls. Acceptance adds the third person to permanent membership, not a new temporary chat.
- **Already-converted groups**: FastAPI automatically migrates old linked temporary groups at startup. It also clears old temporary traveler records that have no recent availability heartbeat. These database corrections are intentional and do not delete the permanent groups.

## Four-account / three-account test

1. Sign in as Ana and Sara in separate browser profiles, set active Hamsafar trips, and join a temporary group.
2. Convert it to a permanent group and verify it appears in **گروه‌ها**, with their previous chat history.
3. Check that **همسفر → گروه همسفر** no longer shows the converted temporary group.
4. Sign in as Mahan, select an active Hamsafar trip, find the two-member permanent group and request to join.
5. In Ana's or Sara's **گروه‌ها** chat, accept Mahan's request.
6. Log out Mahan and log in again. The permanent group should still be listed, but no temporary group should reappear.

**Note**: For *Now* travel matches, at least one permanent-group member must still be actively publishing their trip. Permanent membership persists even when members are offline.

## API check / tests

- `http://127.0.0.1:8000/api/health` should return `{"status":"ok"}`.
- `http://127.0.0.1:8000/api/docs` lists the API endpoints.
- Run `python -m pytest -q` from `backend` to execute the regression tests (install `pytest` and `httpx` if necessary).
- Run `npm run build` from `frontend` to check the production bundle after `npm install`.

**Important**: The frontend production build and interactive multi-browser flows could not be verified in the packaging environment (npm packages were not cached). Backend API regression tests and JavaScript checks passed. The phone-only login must be replaced with real SMS OTP before public deployment.
