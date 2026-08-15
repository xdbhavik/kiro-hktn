# Peer Mentor Matcher — Backend Update Plan: User Onboarding & Persistence

> **Status:** Proposal — awaiting confirmation before implementation.
> **Scope:** Backend only. Adds the ability to **create and persist** junior profiles and mentor profiles (currently everything is read-only seed data).
> **Companion docs:** `BACKEND_PLAN.md`, `API_DOCUMENTATION.md`. Those will be updated to reflect whatever we land on here.

---

## 1. Why this change

Today the app is read-only:

- `POST /api/match` computes matches but **saves nothing** — the submitted junior profile lives only in frontend state for one session.
- Mentors come exclusively from the static `mentors.json`; juniors from the static `juniorPersonas.json`.
- There is **no create/update route** for either, and mentors are loaded into memory once at startup.

This update adds real onboarding: a junior can register their profile, and a mentor can sign up, with both persisted to the JSON data files so they survive restarts and become part of the live matching pool.

---

## 2. Design principle: JSON files become a mutable store

The steering rule is "No database. All data lives in `backend/data/` as JSON files." We keep that — but the JSON files change role from **static seed** to **mutable store**. Writes go back to the same files.

To do this cleanly we introduce a small **data-store module** that:

- Loads `mentors.json` and `juniorPersonas.json` into memory once at startup.
- Serves reads from the in-memory arrays.
- On create, appends to the in-memory array **and** persists the whole array back to the file.
- Keeps the in-memory pool and the file in sync, so newly added mentors are immediately matchable **without a server restart**.

This replaces the current pattern where `index.js` loads `mentors.json` and passes it to the router. The router and engine will read from the store instead.

**Proposed new file:** `backend/data/store.js` (or `backend/store/dataStore.js`).

---

## 3. New API endpoints

All under the existing `/api` prefix. JSON in/out. No auth (consistent with current app).

### 3.1 Mentors

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/api/mentors` | List all mentors (seed + newly added). |
| `POST` | `/api/mentors` | Create + persist a new mentor. |

**`POST /api/mentors` request body:**

```jsonc
{
  "name": "string",                 // required
  "title": "string",                // required
  "bio": "string",                  // required (one sentence)
  "skills": { "react": 5 },         // required, at least 1 skill; levels 0-5
  "domains": ["frontend"],          // required, at least 1
  "availability": ["weekend"],      // required, subset of the 3 slots
  "maxMentees": 5,                  // required, integer >= 1
  "currentMentees": 0               // optional, default 0, must be < maxMentees
}
```

Server fills in automatically:
- `id` — generated (see §5).
- `avatarInitials` — first two letters of `name`, uppercased.

**Success — `201 Created`:** returns the full created mentor object (including `id` and `avatarInitials`).

### 3.2 Juniors

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/api/personas` | **(existing)** list demo + saved juniors. |
| `POST` | `/api/juniors`  | Create + persist a junior profile. |

**`POST /api/juniors` request body:**

```jsonc
{
  "name": "string",                       // required
  "currentSkills": { "css": 2 },          // optional, default {}; levels 0-5
  "projectGoal": "string",                // required
  "availability": ["weekend"]             // required, subset of the 3 slots
}
```

Server fills in `id` automatically.

**Success — `201 Created`:** returns the created junior object.

> **Open question A (see §9):** should `POST /api/juniors` also run matching and return matches in one call, or stay a pure "save" endpoint with the frontend calling `/api/match` separately? Default proposal: keep it a pure save.

> **Note on `GET /api/personas`:** it currently returns the raw `juniorPersonas.json` array. After this change it returns seed personas **plus** any saved juniors. If the frontend's "demo persona" buttons should only show the original 3, we add a `"seed": true` flag or a query param (`?seedOnly=true`). **Open question B.**

---

## 4. Validation rules

Applied in a shared validation helper. On failure return `400 { error: "<message>", fields: [ ... ] }`.

**Shared:**
- `availability` values must each be one of `weekday-morning | weekday-evening | weekend`.
- Skill levels must be integers `0–5` (mentor skills) / `0–5` (junior currentSkills). Out-of-range → reject.
- Skill names normalized to lowercase + spaces-to-hyphens on the way in.
- String fields trimmed; required strings must be non-empty.

**Mentor-specific:**
- `maxMentees` integer `>= 1`.
- `currentMentees` integer `>= 0` and `< maxMentees` (nobody onboards already-full).
- `skills` must have at least one entry; `domains` at least one.
- Skill names should ideally be from the known vocabulary (see `goalParser.js` `SKILL_VOCABULARY`). Proposal: **allow** unknown skill names but they simply won't contribute to matches. **Open question C:** warn-and-allow vs. strict-reject.

**Junior-specific:**
- `projectGoal` non-empty, max 500 chars (mirrors the frontend limit).

---

## 5. ID generation & avatarInitials

- **avatarInitials:** `name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()`. Fallback to first two of a sanitized name if short.
- **IDs:** keep the existing style (`m1…`, `p1…`). Proposal: compute the next numeric suffix from existing IDs (`m` + (max existing number + 1)). To avoid collisions from concurrent writes, fall back to a short unique suffix (e.g. `m-` + timestamp/random) if needed. **Open question D:** simple incremental vs. always-unique random IDs. Default proposal: incremental with a uniqueness guard.

---

## 6. Persistence details

- Writes serialize the full in-memory array to the file with `fs.promises.writeFile`, pretty-printed (2-space) to keep the JSON diff-friendly.
- Use an **atomic write**: write to a temp file then rename, so a crash mid-write can't corrupt the data file.
- A lightweight in-process write queue (or `await` chaining) prevents interleaved writes from clobbering each other. Sufficient for a single-process hackathon app; not multi-instance safe (called out as a known limitation).
- On any write failure, return `500 { error: "Failed to save <mentor|junior>", detail }` and leave the in-memory array unchanged (write-file-first, then update memory — or roll back memory on failure).

---

## 7. Files touched

| File | Change |
| ---- | ------ |
| `backend/data/store.js` | **New.** Loads, caches, and persists mentors + juniors; exposes `getMentors`, `addMentor`, `getJuniors`, `addJunior`. |
| `backend/routes/match.js` | Add `GET /mentors`, `POST /mentors`, `POST /juniors`. Existing `GET /personas` reads from the store. Router reads mentors from the store instead of an injected array so new mentors are matchable live. |
| `backend/index.js` | Initialize the store at startup; stop passing a frozen `mentors` array into the router. |
| `backend/engine/validation.js` | **New (optional).** Shared request validators for mentor/junior payloads. |
| `API_DOCUMENTATION.md` | Document the 3 new endpoints, request/response schemas, validation errors, and the `GET /api/personas` behavior change. |
| `BACKEND_PLAN.md` | Note the data-store module, the seed→store role change, and the new routes in the Definition of Done. |
| `.kiro/steering.md` (if present) | Clarify that JSON files are now a mutable store, not static seed. |

The pure matching engine (`matcher.js`) and the goal parser (`goalParser.js`) are **not** changed by this update.

---

## 8. Testing plan

1. `POST /api/mentors` with a valid body → `201`, correct `id` + `avatarInitials`; confirm `mentors.json` on disk grew by one entry.
2. Immediately `POST /api/match` with a junior whose gaps match the new mentor → the new mentor appears in results **without restarting** the server.
3. Restart the server → new mentor is still present (persistence survived).
4. `POST /api/mentors` with invalid data (bad availability slot, `currentMentees >= maxMentees`, level 7, empty name) → `400` with field details.
5. `POST /api/juniors` valid → `201`; appears in `GET /api/personas`.
6. Malformed JSON body → clean `400` (existing middleware).
7. Confirm atomic write: data file remains valid JSON after a batch of rapid creates.

---

## 9. Finalized decisions (CONFIRMED)

- **A. Junior endpoint behavior:** `POST /api/juniors` is a **pure save**. It does not run matching. The frontend calls `/api/match` separately.
- **B. Personas listing:** `GET /api/personas` is **unchanged** — it keeps returning only the 3 demo personas from `juniorPersonas.json`. Created juniors are stored in a **separate `backend/data/juniors.json`** and listed via a new `GET /api/juniors`. Demo persona buttons stay pristine.
- **C. Mentor skill names:** **warn-and-allow.** Skill names are normalized (lowercase, hyphenated); names outside `SKILL_VOCABULARY` are accepted with a logged warning (they simply never contribute to matches).
- **D. ID scheme:** **incremental with a uniqueness guard** — mentors `m<next>`, juniors `j<next>`. If a computed ID already exists, fall back to a `<prefix>-<timestamp>` suffix.
- **E. Endpoint naming:** `POST /api/mentors` and `POST /api/juniors`.
- **F. Scope:** **create + list only.** No `PUT`/`DELETE` for now.

### Resulting endpoint set

| Method | Path | Status |
| ------ | ---- | ------ |
| `POST` | `/api/match` | unchanged |
| `GET`  | `/api/personas` | unchanged (3 demo juniors) |
| `GET`  | `/api/health` | unchanged |
| `GET`  | `/api/mentors` | **new** |
| `POST` | `/api/mentors` | **new** |
| `GET`  | `/api/juniors` | **new** |
| `POST` | `/api/juniors` | **new** |

### Storage layout

- `backend/data/mentors.json` — seed + created mentors (mutable).
- `backend/data/juniorPersonas.json` — demo personas only (**read-only**).
- `backend/data/juniors.json` — **new**, created junior signups (mutable, starts as `[]`).

---

*Decisions confirmed — implementation proceeding. `API_DOCUMENTATION.md` and `BACKEND_PLAN.md` will be updated to match.*
