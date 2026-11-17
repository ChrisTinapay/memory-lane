# Memory Lane — Codebase Guide

A file-by-file walkthrough of this project.

This guide reflects the codebase **after** a restructuring pass described in
[What changed and why](#what-changed-and-why) below.

---

## 1. The mental model

Memory Lane has two halves that only ever talk over HTTP:

```
┌─────────────────────┐        HTTP (fetch)        ┌──────────────────────┐
│   frontend/          │  ───────────────────────▶  │   backend/             │
│   React app (Vite)   │  ◀───────────────────────  │   FastAPI app          │
│   localhost:5173     │        JSON responses       │   localhost:8000       │
└─────────────────────┘                             └──────────┬────────────┘
                                                                 │
                                                      ┌──────────▼───────────┐
                                                      │   MongoDB              │
                                                      │   ("lanes" collection) │
                                                      └────────────────────────┘
                                                                 ▲
                                                      also calls │
                                                      ┌──────────┴───────────┐
                                                      │   TMDB API (external)  │
                                                      └────────────────────────┘
```

The frontend never talks to MongoDB or TMDB directly — it only ever calls the
FastAPI backend, and the backend is the only thing that talks to Mongo and TMDB.

Auth is real registered accounts (`fastapi-users`, backed by a Beanie `User`
document), using a cookie-based JWT session rather than a token the frontend
reads or stores itself — the browser holds an httpOnly cookie
(`memorylane_auth`), and every `fetch` just needs `credentials: "include"`
(see `frontend/src/api.js`). Every `Lane` is created with `user_id` set
server-side from that session; nothing in the request body is trusted for it.

---

## 2. Backend (`backend/`)

```
backend/
├── main.py                  ← app entry point
├── .env                     ← secrets (not committed)
└── app/
    ├── config.py             ← reads .env, exposes settings
    ├── database.py            ← connects to MongoDB
    ├── tmdb.py                 ← shared "call the TMDB API" helper
    ├── users.py                 ← fastapi-users wiring: cookies, JWT, dependencies
    ├── friends.py                ← shared "look up a friendship" queries
    ├── models/
    │   ├── lane.py            ← the Lane document schema
    │   ├── user.py             ← the User document + auth request/response schemas
    │   └── friendship.py       ← the Friendship document schema
    └── routes/
        ├── search.py          ← GET /api/search/, GET /api/search/trailer
        ├── lanes.py           ← pave / my-lane / reflection / delete
        └── friends.py          ← search / request / accept / decline / list
```

### `main.py`
The entry point. Uvicorn runs this file (`uvicorn main:app`). It:
- Creates the FastAPI `app`.
- Runs `init_db()` once on startup (via the `lifespan` context manager).
- Configures CORS so only `localhost:5173` (the Vite dev server) can call the
  API, with `allow_credentials=True` — required for the browser to send the
  auth cookie on cross-origin requests to the backend.
- Registers the auth routers from `fastapi_users` (see `app/users.py`) under
  `/auth/...` and `/users/...` — registration, login/logout, password reset,
  email verification, and the current-user profile endpoints.
- Registers the three app routers (`search`, `lanes`, `friends`) — this is
  what actually wires `/api/search/...`, `/api/lanes/...`, and
  `/api/friends/...` URLs to the code that handles them.

If you're wondering "where does a URL path turn into Python code?" — it starts
here, then follows into `app/routes/`.

### `app/config.py`
The **only** file that reads environment variables. It loads `backend/.env`
and fails loudly at startup if `MONGO_URI`, `TMDB_READ_TOKEN`, or `JWT_SECRET`
is missing. Nothing else in the backend should call `os.getenv` directly — if
a new file needs a setting, add it here and import it from there. Also
defines `TMDB_API_BASE_URL` (`https://api.themoviedb.org/3`) and derives the
default `TMDB_API_URL` (the search endpoint) from it, so the domain is only
written once.

### `app/tmdb.py`
One small helper, `fetch_tmdb(url)`, that builds the TMDB auth headers once
and makes the actual HTTP call. Both `search.py` endpoints (search and
trailer lookup) call this instead of each building their own `httpx` client
and header dict — the "how do we talk to TMDB" concern lives in exactly one
place.

### `app/users.py`
Everything needed to run registration/login/logout, all built on
`fastapi-users`:
- `get_user_db` / `get_user_manager` — how fastapi-users reaches the `users`
  collection and constructs its `UserManager` (which also logs
  password-reset/verification tokens to the console — see
  [Not done here](#not-done-here) below).
- `cookie_transport` — an httpOnly, `SameSite=Lax` cookie named
  `memorylane_auth`. `cookie_secure=False` is explicitly for local
  `http://localhost` dev; flip it to `True` before ever deploying behind
  HTTPS.
- `get_jwt_strategy` / `auth_backend` — signs/verifies the session token
  using `JWT_SECRET`, 7-day lifetime.
- `current_active_user` — a FastAPI dependency other routers use to require a
  logged-in, active user (401 otherwise). Used by every `lanes.py` endpoint.
- `current_active_user_optional` — same, but returns `None` instead of
  raising when no one is logged in. Used by `search.py` so browsing doesn't
  require an account.

Nothing outside this file should construct a `UserManager` or JWT strategy
directly — same rule `config.py` already applies to environment variables.

### `app/friends.py`
Three shared queries over the `friendships` collection, used by both
`routes/friends.py` (the friends UI's own endpoints) and `routes/search.py`
(which needs to know "who's in my network" to compute `social_status`) — the
same "one place" rule `tmdb.py` and `users.py` already follow:
- `get_friend_ids(user_id)` — every other user id with an *accepted*
  friendship with `user_id`. This is what replaced the old hardcoded
  `FRIEND_NETWORK_IDS` placeholder constant in `search.py`.
- `find_friendship(user_id, other_id)` — the `Friendship` row between two
  users, in either direction, or `None`.
- `get_relationship_status(user_id, other_id)` — one of `"none"`,
  `"pending_sent"`, `"pending_received"`, `"friends"`, from `user_id`'s point
  of view. Used by the friend-search endpoint so the UI knows whether to show
  "Add Friend", "Request sent", or nothing.

(There used to be an `app/constants.py` here holding `FRIEND_NETWORK_IDS`
(a hardcoded fake friends list) and, before that, `CURRENT_USER_ID` — both
placeholders for features that didn't exist yet. Both are gone now: real
auth replaced `CURRENT_USER_ID`, and real friend-linking, built on this file,
replaced `FRIEND_NETWORK_IDS`.)

### `app/database.py`
Connects to MongoDB and tells Beanie (the ODM/library that lets you treat
Mongo documents like Python classes) which document models exist —
`Lane`, `User`, and `Friendship`. `init_db()` is called once, at startup,
from `main.py`.

### `app/models/lane.py`
Defines `Lane`, the persisted "paved" movie/show entity, plus `LaneCreate`.
Because `Lane` is a Beanie `Document`, it doubles as the MongoDB schema
(collection name: `lanes`) and (previously) the request body for
`POST /api/lanes/pave` directly. That's no longer safe now that `user_id`
means something real (a Mongo `_id` of an actual account) rather than a
shared placeholder string — a client could otherwise pave into someone
else's lane just by putting a different `user_id` in the request body. So
`pave_lane` (in `routes/lanes.py`) takes `LaneCreate` instead — the same
fields, minus `user_id` — and the route sets `user_id` itself from the
authenticated session.

If you need to know what fields a "lane" has (`tmdb_id`, `rating`,
`reflection`, etc.), `Lane` is the file to read.

### `app/models/user.py`
Defines `User` (the registered-account entity fastapi-users manages) and the
three schemas its routes use: `UserRead`, `UserCreate`, `UserUpdate`. `User`
subclasses `BeanieBaseUserDocument` from `fastapi-users-db-beanie`, which
already provides `id`, `email`, `hashed_password`, `is_active`,
`is_superuser`, `is_verified` as a real Beanie `Document` — so this class
just points it at the `users` collection. The schemas stay separate from
`User` on purpose: they're what the API exposes to the outside world (never
`hashed_password`), while `User` is what's actually stored in Mongo.

### `app/models/friendship.py`
Defines `Friendship` — one row per friend relationship, in either direction,
plus `FriendRequestCreate` (the request body for sending one). Deliberately
has no "declined" status: `status` is just `"pending"` or `"accepted"`, and
declining a request (or cancelling one you sent, or unfriending someone) all
just **delete the row** (see `routes/friends.py`) — so a declined request
doesn't linger and block a future one.

### `app/routes/search.py`
Two endpoints:

**`GET /api/search/`** — the main search, usable whether or not you're logged
in (`user: Optional[User] = Depends(current_active_user_optional)`). Logic,
in order:
1. Forward the query to TMDB's multi-search endpoint.
2. Filter out non-movie/TV results (e.g. actor profiles).
3. If logged in, look up your real friend ids via `app/friends.py`'s
   `get_friend_ids(user_id)`, add your own id, and find which of the search
   result TMDB IDs already exist in the `lanes` collection among that whole
   set. If logged out, this set is empty — see step 4.
4. For each result, compute a `social_status`: `unpaved`, `paved_by_me`,
   `paved_by_friend`, or `co_paved`. Logged out, there's no network to check
   against at all, so everything reads as `unpaved`.
5. Attach `network_paves`: for every pave in your network on this title, the
   paver's email, when they paved it, their `reflection`, and `is_me`. This
   is what lets `Movies.jsx` show a friend's engraved memory straight from a
   search result — it's populated with the same query as `social_status`, so
   nothing extra is fetched to get it. (This replaced two older, thinner
   fields, `first_paved_by`/`friends_who_paved`, which only ever exposed raw
   Mongo `_id`s — not enough to show anything readable about who paved it.)
6. Return the enriched list — note this does **not** include trailer data;
   TMDB's multi-search response never has it, regardless.

This is the most complex endpoint in the backend — it's the only place TMDB
data and Mongo data get merged together.

**`GET /api/search/trailer?tmdb_id=...&media_type=movie|tv`** — looks up
`{TMDB_API_BASE_URL}/{media_type}/{tmdb_id}/videos`, picks the first YouTube
video tagged `"Trailer"` (falling back to any YouTube video if there's no
official trailer), and returns `{"url": "<youtube watch url>" | null}`. This
is called **on demand**, only when a user clicks "Trailer" on a specific
card — not for every search result up front, which would mean one extra TMDB
call per visible card on every search for a feature most results never use.

### `app/routes/friends.py`
Every endpoint here requires a logged-in user. Seven endpoints:
- `GET /api/friends/search?email=...` — **exact** email match only (via the
  same case-insensitive `get_by_email` lookup fastapi-users itself uses for
  login), excluding yourself. A "contains" search was deliberately avoided —
  it would let anyone enumerate every registered email on the site just by
  typing in partial strings. Returns the matched user's relationship status
  to you (`"none"` / `"pending_sent"` / `"pending_received"` / `"friends"`,
  from `app/friends.py`) so the UI knows whether to show "Add Friend".
- `POST /api/friends/request` (body: `{"recipient_id": "..."}`) — creates a
  `Friendship`. Rejects friending yourself and rejects a duplicate if any
  row (pending or accepted, either direction) already exists between the
  two of you.
- `GET /api/friends/requests` — your **incoming** pending requests, each
  with the sender's email resolved.
- `POST /api/friends/requests/{id}/accept` — only the *recipient* of that
  specific request can accept it (404 otherwise, not 403 — this doesn't
  confirm to a caller that some other pending request with that id exists
  at all); flips `status` to `"accepted"`.
- `DELETE /api/friends/requests/{id}` — one endpoint doing three jobs:
  declining an incoming request, cancelling one you sent, or unfriending an
  already-accepted friendship. All three are just "delete the row, if you're
  a party to it" — there's no reason to give them three separate routes.
- `GET /api/friends/` — your accepted friends, each with the `Friendship`
  row's own id (`friendship_id`) included specifically so the frontend can
  call the `DELETE` endpoint above to unfriend someone directly from this
  list, without a second lookup.
- `GET /api/friends/{friend_id}/lane` — that friend's full paved lane
  (same shape as `GET /api/lanes/my-lane`, plus `friend_email`), gated on
  `get_relationship_status(you, friend_id) == "friends"`. Returns **403**,
  not 404, if you're not friends — unlike `get_owned_lane` in `lanes.py`,
  this isn't hiding whether the account exists (you can already find it via
  `/api/friends/search`), only whether you're allowed to see their lane.
  Note this also 403s if you pass your own id — this endpoint is for
  viewing a *friend's* lane; `/api/lanes/my-lane` is for your own.

### `app/routes/lanes.py`
Every endpoint here requires a logged-in user
(`user: User = Depends(current_active_user)` — 401 if not) and identifies
"you" from that session, never from anything the client sends:
- `POST /api/lanes/pave` — takes a `LaneCreate` (no `user_id` field, see
  `models/lane.py` above), sets `user_id = str(user.id)` itself, then inserts
  a new `Lane` — but first checks for an existing `(tmdb_id, user_id)` pair so
  the same title can't be paved twice.
- `GET /api/lanes/my-lane` — list the current user's paved lanes, newest first.
- `PUT /api/lanes/{lane_id}/reflection` — overwrite a lane's `reflection`
  text with whatever the request body sends (no length limit).
- `DELETE /api/lanes/{lane_id}` — delete a lane entirely.

The reflection-update and delete endpoints both need to do the same thing
first — look the `Lane` up by id and 404 if it's missing or doesn't belong to
the requesting user — so that check lives once, in the `get_owned_lane(lane_id,
user)` helper at the top of the file, and both endpoints call it instead of
repeating the lookup+ownership check. This 404 (rather than a 403) is
deliberate: it doesn't confirm to a caller that some *other* user's lane with
that id exists at all.

---

## 3. Frontend (`frontend/src/`)

```
frontend/src/
├── main.jsx                        ← React entry point, wraps App in AuthProvider
├── api.js                          ← backend URL + apiFetch + auth helper functions
├── App.jsx                         ← root component: gated by auth, tab switching
├── App.module.css                  ← styles for App.jsx only
├── styles/
│   ├── global.css                   ← design tokens + global element reset
│   └── shared.module.css            ← styles shared by Movies + MyLane
├── contexts/
│   ├── AuthContext.js                ← the auth React context + useAuth() hook
│   └── AuthProvider.jsx              ← the component that owns auth state
└── components/
    ├── Auth.jsx                      ← login/register screen
    ├── Auth.module.css               ← styles for Auth.jsx only
    ├── Search.jsx                   ← search bar only: input, fetch, loading
    ├── Search.module.css            ← styles for Search.jsx only
    ├── Movies.jsx                    ← search-result cards, pave, poster/overview
    ├── Movies.module.css             ← styles for Movies.jsx only
    ├── MyLane.jsx                    ← "my paved lanes" list + delete action
    ├── MyLane.module.css             ← styles for MyLane.jsx only
    ├── Reflection.jsx                 ← "Engrave Memory" editor for a paved lane
    ├── Reflection.module.css          ← styles for Reflection.jsx only
    ├── Friends.jsx                     ← friend search, requests, friends list
    ├── Friends.module.css              ← styles for Friends.jsx only
    ├── FriendLane.jsx                    ← read-only view of a friend's lane
    └── FriendLane.module.css             ← styles for FriendLane.jsx only
```

### The logic/style split (read this first)
Every component file (`.jsx`) now contains **only markup and logic** — state,
event handlers, `fetch` calls, conditional rendering. Every `className` refers
to a name imported from a matching `*.module.css` file sitting right next to
it:

```jsx
// Movies.jsx
import styles from './Movies.module.css';
// ...
<button className={styles.paveButton}>+ Pave Lane</button>
```

```css
/* Movies.module.css */
.paveButton {
  background-color: var(--color-accent);
  /* ... */
}
```

This is called a **CSS Module**. Vite (the build tool this project uses)
automatically treats any file named `*.module.css` this way — no extra setup
needed. Each component's classes are scoped to that file alone, so
`.card` in `Search.module.css` can never accidentally clash with a `.card`
somewhere else.

**To change what something looks like:** open the matching `.module.css` file.
**To change what something does:** everything you need is in the `.jsx` file,
with no style noise in the way.

### `main.jsx`
The actual entry point — the one Vite loads first. Mounts `<App />` into the
`#root` div in `index.html`, wrapped in `<StrictMode>` and, inside that, in
`<AuthProvider>` — so anything in the tree can call `useAuth()`. Imports
`styles/global.css` — nothing else imports it; it's the one truly global
stylesheet.

### `api.js`
Two things:
1. `API_BASE_URL` and `apiFetch(path, options)` — a thin wrapper around
   `fetch` that always adds `credentials: 'include'`, so the browser sends
   the httpOnly auth cookie to the backend. **Every** component that talks to
   the API (`Search.jsx`, `Movies.jsx`, `MyLane.jsx`, `Reflection.jsx`, and
   the auth helpers below) goes through this instead of calling `fetch`
   directly — skip it and a request will silently look logged-out even with
   a valid session, since the cookie won't be attached.
2. `registerAccount`, `login`, `logout`, `fetchCurrentUser` — thin wrappers
   around the `/auth/...` and `/users/me` endpoints, used only by
   `AuthProvider.jsx`. `login` in particular has to send an
   `application/x-www-form-urlencoded` body with a `username` field (fastapi-
   users' JWT login route expects an OAuth2 password form, not JSON — even
   though this app logs in by email).

### `contexts/AuthContext.js`
Just `createContext` plus the `useAuth()` hook that reads it and throws if
called outside an `<AuthProvider>`. Split into its own plain-`.js` file
(no components) so `AuthProvider.jsx` can export *only* a component — Vite's
fast refresh only works reliably on files that exclusively export components,
and ESLint's `react-refresh` rule (already configured in
`eslint.config.js`) enforces that.

### `contexts/AuthProvider.jsx`
Owns the single piece of state the whole app cares about: `user` (`null` when
logged out) and `loading` (true only while the very first `/users/me` check,
restoring a session from the existing cookie, is in flight). Exposes
`login`, `register`, and `logout` — each calls the matching `api.js` helper,
then re-fetches `/users/me` (or clears `user` on logout) so every consumer of
`useAuth()` re-renders with the new state. `register` logs the new account in
right after registering, since fastapi-users' register endpoint doesn't do
that itself — otherwise you'd land on a second form immediately after filling
out the first one.

### `styles/global.css`
The single global stylesheet, combining two things that both apply
everywhere with no `import styles from ...` needed:
1. **Design tokens** — CSS custom properties for colors (`--color-bg`,
   `--color-text`, `--color-accent`, etc.) and border radii
   (`--radius-sm/md/lg`), defined on `:root`. Every other stylesheet
   references these tokens (`var(--color-accent)`) instead of hardcoding hex
   values or pixel/rem literals. **This is the one place to edit to re-theme
   the whole app** — e.g. swapping the palette only means changing the four
   `--palette-*` values at the top of this file.
2. **The element reset** — base font stack, `<body>` background/color,
   default `<a>`/`<button>` appearance, all pulling from the tokens above.

Intentionally has no component-specific classes — if you find yourself adding
a class here for one component, it belongs in that component's `.module.css`
instead. (This is also why it's a plain `.css` file, not `.module.css`: Vite
only scopes/hashes class names in files named `*.module.css`. A file meant to
style bare `body`/`button`/`a` tags globally needs to stay unscoped — that's
what makes it apply everywhere without an import per component. The scoped
card/grid styles in `shared.module.css` are kept in their own file for
exactly the opposite reason.)

### `App.jsx` / `App.module.css`
The root component. Reads `{ user, loading, logout }` from `useAuth()`:
- While `loading` (the initial session check), renders an empty page rather
  than flashing the login screen for a split second on every reload.
- If `user` is `null`, renders `<Auth />` instead of the tabs — nothing past
  this point is reachable while logged out.
- If logged in, renders the tab nav, an account row (email + logout button),
  and — based on its own `activeTab` state — `<Search />`, `<MyLane />`, or
  `<Friends />`.

### `components/Auth.jsx` / `Auth.module.css`
The login/register screen, toggled by a local `mode` state
(`'login' | 'register'`) rather than two separate routes — there's no router
in this app, and the two forms share almost everything. Calls `login` or
`register` from `useAuth()` depending on `mode`; on failure, shows the
thrown error's message (see `readableAuthError` in `api.js`, which maps
fastapi-users' error codes like `LOGIN_BAD_CREDENTIALS` to plain text).
`Auth.module.css` uses only existing tokens from `styles/global.css` — no new
colors were introduced for it.

### `styles/shared.module.css`
`Movies.jsx` and `MyLane.jsx` both render a responsive grid of poster cards,
and would otherwise duplicate the exact same styling for that grid. Since
it's genuinely the same visual component in two places, its styles live in
one shared module (`.grid`, `.card`, `.poster`, `.posterPlaceholder`,
`.cardTitle`, `.cardMeta`) that both components import. Anything specific to
just one screen (the search bar, the pave button, the empty state, badges,
the delete button) stays in that component's own module.

### `components/Search.jsx` / `Search.module.css`
Strictly the search bar: the text input, the submit button, the `loading`
state, and the `GET /api/search/?query=...` fetch. It holds the `results`
array in state (since it's the one that fetches it) but renders none of the
result cards itself — it hands `results` (and `setResults`, so pave can
update it) to `<Movies />`. `Search.module.css` only has the wrapper/form/
input/button styles.

### `components/Movies.jsx` / `Movies.module.css`
Renders the grid of search-result cards (via `shared.module.css`) and owns
five interactions:
1. **Pave** — a button per unpaved/friend-paved result that calls
   `POST /api/lanes/pave` (via `apiFetch`, so the auth cookie is sent — this
   endpoint 401s without it), then optimistically updates that card's badge
   via the `setResults` prop, without waiting for a re-fetch. Note the
   request body has no `user_id` field — the backend determines the pave-r
   from the session, and would ignore a client-supplied one anyway (see
   `LaneCreate` in `models/lane.py`).
2. **Poster expand** — clicking a poster opens it larger in a fullscreen
   overlay (`expandedPoster` state); clicking anywhere closes it.
3. **See more...** — a per-card toggle (`expandedOverviews`, a `Set` of
   `tmdb_id`s) that reveals the TMDB `overview` text already included in the
   search response — no extra fetch needed.
4. **Trailer** — a text link under the poster that calls
   `GET /api/search/trailer?tmdb_id=...&media_type=...` **only when clicked**
   (fetched lazily per card, then cached in a `trailers` state map keyed by
   `tmdb_id` so a second click on the same card doesn't refetch), and opens
   the returned YouTube URL in a new tab. The tab is opened synchronously on
   the click itself (`window.open('', '_blank')`, its `location` set once the
   fetch resolves) specifically so browsers don't block it as an unrequested
   popup — opening it only after the `await` would get blocked in most
   browsers.
5. **Friend activity** — when a result's `network_paves` has any entries
   with `is_me: false`, a toggle (`expandedFriendPaves`, the same
   Set-of-`tmdb_id`s pattern as the overview toggle) reveals each friend's
   email, the date they paved it, and their `reflection` text if they wrote
   one — all pulled straight from the search response's `network_paves`,
   no extra fetch. This is what surfaces a friend's engraved memory on a
   title right from search, without needing to open their lane separately.

`Movies.module.css` holds the four badge variants (`co_paved` /
`paved_by_me` / `paved_by_friend` / `unpaved`), the pave button, the overlay,
the see-more/overview text, the trailer link, and the friend-activity list.
Per the current monochrome theme, all three badge variants look visually
identical — they're told apart by icon + label, not color.

### `components/MyLane.jsx` / `MyLane.module.css`
The "My Memory Lane" tab. Fetches `GET /api/lanes/my-lane` once on mount and
renders three possible states: loading, empty, or a grid of paved items
(reusing `shared.module.css` for the cards). Each card also renders
`<Reflection lane={item} onSave={handleReflectionSave} />` and a **delete**
button that calls `DELETE /api/lanes/{lane._id}` and removes the item from
local state on success. `MyLane.module.css` holds the loading text,
empty-state box, heading, and paved-date styling (the delete button itself is
currently unstyled — plain default `<button>`, on purpose, pending a design
pass).

### `components/Reflection.jsx` / `Reflection.module.css`
A self-contained "Engrave Memory" editor for one paved lane. Default view is
a button (plus the existing reflection text, if any); clicking it switches to
a `<textarea>` with Save/Cancel. Save calls
`PUT /api/lanes/{lane._id}/reflection` itself, then calls the `onSave(laneId,
reflection)` prop so `MyLane.jsx` updates that lane in its own state —
the same "component owns its own fetch, parent just gets a state-update
callback" pattern `Movies.jsx` uses for paving. `Reflection.module.css` holds
the button, textarea, and Save/Cancel styling.

### `components/Friends.jsx` / `Friends.module.css`
The "Friends" tab, in three self-contained sections, each fetching its own
data on mount:
1. **Find Friends** — a single-email search form calling
   `GET /api/friends/search?email=...`. The result renders an "Add Friend"
   button only when `status === 'none'`; otherwise it just shows the current
   status as text (`"Request sent"`, `"Already friends"`, etc.) — search
   results don't carry a `Friendship` id, so there's nothing to accept from
   here even for `pending_received` (that happens in the next section).
2. **Friend Requests** — incoming pending requests from
   `GET /api/friends/requests`, each with Accept / Decline buttons.
3. **Your Friends** — accepted friends from `GET /api/friends/`, each with a
   **View Lane** button (sets local `viewingFriend` state, swapping this
   whole component out for `<FriendLane friend={f} onBack={...} />`) and an
   Unfriend button using that entry's `friendship_id`.

All the mutating actions (send/accept/decline/unfriend) just update local
state directly from the response rather than re-fetching all three sections
every time — the same optimistic-update pattern used elsewhere in this app.

### `components/FriendLane.jsx` / `FriendLane.module.css`
A **read-only** counterpart to `MyLane.jsx` for viewing one specific friend's
paved lane: fetches `GET /api/friends/{friend.id}/lane` on mount (reusing
`shared.module.css` for the same card grid `MyLane.jsx` and `Movies.jsx`
use), shows each lane's `reflection` text if present, and has a "Back to
Friends" button that calls the `onBack` prop. No delete button and no
`<Reflection />` editor here — those only make sense for lanes you own. If
the backend 403s (not actually friends with this person — shouldn't be
reachable through the UI, since the button only appears for people already
in your accepted-friends list, but the component still handles it rather
than assuming), it shows an error message instead of a card grid.

---

## 4. A full request, start to finish

To tie it all together, here's what happens from opening the app for the
first time through registering, paving, and deleting:

1. **App loads, logged out.** `AuthProvider` calls `GET /users/me` on mount;
   with no cookie yet, the backend 401s, so `user` stays `null` and
   **`App.jsx`** renders **`Auth.jsx`** instead of the tabs.
2. You fill out the register form → **`Auth.jsx`** calls `register(email,
   password)` from `useAuth()`, which calls `POST /auth/register`, then
   immediately `POST /auth/jwt/login` (register doesn't log you in by
   itself), then re-fetches `/users/me`.
3. **`main.py`**'s auth routers (from `fastapi_users`, wired in
   **`app/users.py`**) handle all three: create the `User` document, verify
   the password and issue a JWT, and return the profile. The login response
   sets the httpOnly `memorylane_auth` cookie — nothing touches
   frontend-visible storage.
4. `AuthProvider` now has a real `user`, so **`App.jsx`** swaps in the tabs.
   You're on "Search & Pave" by default.
5. **`Search.jsx`** — `handleSearch` fires on form submit, calls
   `apiFetch('/api/search/?query=Inception')` (cookie attached automatically).
6. **`main.py`** routes this to **`app/routes/search.py`**, whose
   `current_active_user_optional` dependency reads the cookie and resolves
   the logged-in `User`.
7. **`search.py`** calls TMDB, filters results, looks up your real friend ids
   via `app/friends.py`'s `get_friend_ids`, and queries Mongo via the `Lane`
   model (`app/models/lane.py`) for existing paves among your friends plus
   your own id, and returns enriched JSON.
8. **`Search.jsx`** stores the results and passes them to **`Movies.jsx`**,
   which renders the grid (styled by `shared.module.css`) with a badge per
   item, styled by `Movies.module.css`.
9. You click "Pave Lane" in `Movies.jsx` → `handlePave` calls
   `apiFetch('/api/lanes/pave', ...)` with no `user_id` in the body.
10. **`lanes.py`**'s `current_active_user` dependency resolves who you are
    from the cookie, checks for a duplicate `(tmdb_id, user_id)`, then
    inserts a new `Lane` document with `user_id` set to your real account id.
11. Switching to the "My Memory Lane" tab mounts **`MyLane.jsx`**, which calls
    `GET /api/lanes/my-lane` and lists everything `lanes.py` returns for you.
12. You click "Engrave Memory" on a card, write a note, and hit Save →
    **`Reflection.jsx`** calls `apiFetch('/api/lanes/{lane._id}/reflection',
    ...)`.
13. **`lanes.py`** (via `get_owned_lane(lane_id, user)`) confirms the lane
    belongs to *you specifically* — a different logged-in user hitting the
    same URL gets a 404, not your data — saves the new `reflection` text to
    Mongo, and `Reflection.jsx`'s `onSave` callback updates that lane in
    `MyLane.jsx`'s state so the note shows immediately.
14. You click "Delete" on a card → `handleDelete` calls
    `apiFetch('/api/lanes/{lane._id}', { method: 'DELETE' })`.
15. **`lanes.py`** (via the same `get_owned_lane` helper) confirms ownership
    and deletes it from Mongo; `MyLane.jsx` then removes it from local state
    so the UI updates without a re-fetch.
16. You click "Log out" → `logout()` calls `POST /auth/jwt/logout` (which
    clears the cookie) and sets `user` back to `null`; `App.jsx` immediately
    swaps back to `<Auth />`. Reloading the page at this point calls
    `GET /users/me` with no cookie and stays logged out — exactly step 1
    again.

---

## 5. What changed and why

This restructuring pass made four changes, based on what came up while
reading through the code:

1. **Styles moved out of JSX into CSS Modules.** The components previously
   used Tailwind-style utility class names (`bg-slate-900`, `rounded-lg`,
   etc.) directly in `className` strings — but Tailwind itself was never
   installed or configured in this project (check `package.json` — there's no
   `tailwindcss` dependency, and `vite.config.js` has no Tailwind plugin). In
   practice, none of those classes were doing anything. They've been replaced
   with real CSS in `*.module.css` files next to each component, so the JSX
   is now just logic and markup, and the styling actually works.

2. **`App.css` was deleted.** It defined `.page`, `.container`, `.title`, and
   `.subtitle`, but nothing in `App.jsx` ever referenced those class names —
   it was dead code left over from an earlier version of the component. Its
   real replacement is `App.module.css`.

3. **Duplicate `CURRENT_USER_ID` constants were consolidated.** Both
   `app/routes/search.py` and `app/routes/lanes.py` independently declared
   `CURRENT_USER_ID = "guest_user"`. Both now import it from the new
   `app/constants.py`, so there's one place to update once real auth exists.
   *(Update: real auth has since landed — see section 6 — and
   `CURRENT_USER_ID` no longer exists at all; routes get the real user from
   `app/users.py`'s `current_active_user` instead. Kept here as history.)*

4. **Fixed a crash in the pave flow.** `Search.jsx`'s `handlePave` was
   building its request body with `Number(rating)` and `reflection` —
   neither of which existed anywhere in the component (no state, no props,
   no form field). Since `Lane.rating` and `Lane.reflection` are both
   optional on the backend (`app/models/lane.py`), the fix was to simply stop
   sending them until this component actually collects a rating/reflection
   from the user. Before this fix, clicking "Pave Lane" would throw
   `ReferenceError: rating is not defined` and silently fail.

---

## 6. Known placeholders (not bugs)

These are intentional, temporary shortcuts — don't "fix" them without adding
the real feature first:

- **No rating input UI.** The `Lane` model supports a 1–5 rating, but no form
  in the frontend collects it yet (reflection now does, via `Reflection.jsx`).
- **No friend-request notifications.** Sending a request doesn't notify the
  recipient in any way (no email, no in-app badge/count) — they only find out
  by opening the Friends tab and checking "Friend Requests" themselves.
- **No real email sending.** Password-reset and email-verification tokens
  (`app/users.py`) are only ever `print()`ed to the server console — the
  endpoints work end-to-end, but nothing emails the token to the user. Fine
  for local dev, not for production.
- **`cookie_secure=False`** (`app/users.py`) is for local `http://localhost`
  only. Must be flipped to `True` before this is ever deployed behind HTTPS.

## 7. Suggested next steps

- Add a real form for the 1–5 rating (the one `Lane` field still unused by
  the frontend) — could live in `Reflection.jsx` alongside the memory text.
- Give the "Delete" button in `MyLane.jsx` real styling — it's currently a
  bare, unstyled `<button>` by design, added ahead of a design pass.
- Wire up real email delivery for password reset / verification (see
  "No real email sending" above) before relying on either in production.
- Flip `cookie_secure` to `True` in `app/users.py` when this is deployed
  behind HTTPS.
- Some way to notice a new friend request without opening the Friends tab
  (an unread-count badge on the tab itself would be the smallest version of
  this — no new backend endpoint needed, `GET /api/friends/requests`'s
  length already has the count).
