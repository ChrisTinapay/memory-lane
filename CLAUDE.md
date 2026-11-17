# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Memory Lane is a FARM-stack (FastAPI, React, MongoDB) app for logging movies/TV shows. Users search TMDB, "pave" (save) titles into their personal lane, and see social context — whether a title has already been paved by themselves or a friend.

## Commands

### Backend (`backend/`)

```
cd backend
venv\Scripts\activate          # activate the existing venv (Windows)
pip install -r requirements.txt
uvicorn main:app --reload      # run dev server on http://localhost:8000
```

Requires a `backend/.env` file with `MONGO_URI`, `TMDB_READ_TOKEN`, and `JWT_SECRET` (see `app/config.py` — all three are required and the app raises on startup if any is missing). `TMDB_API_URL` and `TMDB_API_BASE_URL` are optional and default to TMDB's multi-search endpoint and API root respectively.

There is no test suite or linter configured for the backend.

### Frontend (`frontend/`)

```
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run build
npm run lint        # ESLint
npm run preview
```

There is no frontend test suite configured.

## Architecture

- **Backend** (`backend/`): FastAPI app. Entry point is `backend/main.py`, which creates the app, sets up CORS (allowing only `localhost:5173`), and registers routers from `app/routes/`. App code lives under `backend/app/`:
  - `config.py` — loads `.env` and exposes required settings; fails fast if `MONGO_URI` or `TMDB_READ_TOKEN` is unset.
  - `database.py` — initializes the async Mongo client and Beanie ODM (`init_db`, called from the FastAPI lifespan on startup).
  - `models/lane.py` — the `Lane` Beanie `Document` (the only persisted entity): a saved movie/TV item tied to a `user_id`, with `tmdb_id`, `rating`, `reflection`, etc. Collection name is `lanes`.
  - `routes/search.py` — `GET /api/search/`: proxies a query to the TMDB multi-search API, then cross-references results against Mongo to annotate each result with `social_status` (`unpaved`, `paved_by_me`, `paved_by_friend`, `co_paved`) based on a hardcoded `FRIEND_NETWORK_IDS` list (friend-linking is not yet implemented — this is a placeholder).
  - `routes/lanes.py` — `POST /api/lanes/pave` (insert a `Lane`, deduped by `tmdb_id` + `user_id`) and `GET /api/lanes/my-lane` (list the current user's paved lanes, newest first).
  - Auth is real accounts via `fastapi-users` (`app/models/user.py`, `app/users.py`), backed by a Beanie `User` document (collection `users`) and cookie-based JWT sessions (`allow_credentials=True` CORS + an httpOnly `memorylane_auth` cookie — no token ever touches localStorage or frontend JS). `main.py` mounts its routers under `/auth/...` and `/users/...`. Every `Lane` is now created with `user_id` set server-side from the authenticated session (`current_active_user` dependency); search stays browsable while logged out via `current_active_user_optional`.

- **Frontend** (`frontend/src/`): Vite + React 19, no router — a single `App.jsx` toggles between two tabs by local state (`activeTab`):
  - `components/Search.jsx` — search form that calls the backend search endpoint, renders results with social-status badges, and lets the user "pave" a title.
  - `components/MyLane.jsx` — fetches and displays the current user's paved lanes.
  - The frontend calls the backend directly via hardcoded `http://localhost:8000` URLs (no env-based API base URL, no Vite proxy config).
  - Styling uses Tailwind-style utility classes in JSX but there is no Tailwind build step configured in `package.json`/`vite.config.js` — check current styling setup before assuming Tailwind is wired up.

## Data flow

TMDB search → backend enriches with Mongo lane data (social status) → frontend renders → user paves → `POST /api/lanes/pave` inserts a `Lane` document, keyed by `(tmdb_id, user_id)` to prevent duplicates.
