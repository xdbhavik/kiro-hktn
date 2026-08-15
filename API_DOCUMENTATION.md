# Peer Mentor Matcher — API Documentation

> **Shared contract between the frontend and backend developers.** This is the single source of truth for request/response shapes. If either side needs to change a shape, update this file first and tell the other developer. Both `FRONTEND_PLAN.md` and `BACKEND_PLAN.md` defer to this document.

---

## 1. Basics

| | |
| --- | --- |
| Backend base URL | `http://localhost:5500` |
| API prefix | `/api` |
| Frontend origin | `http://localhost:3000` |
| CORS | Backend allows `http://localhost:3000` |
| Content type | `application/json` for all requests/responses |
| Auth | None (no sessions, no tokens) |
| Dev proxy | CRA `"proxy": "http://localhost:5500"` lets the frontend call relative paths like `/api/match` |

Endpoints:
- `POST /api/match` — compute matches (no write)
- `GET /api/personas` — read the 3 demo juniors (read-only seed)
- `GET /api/mentors` — list all mentors
- `POST /api/mentors` — onboard a new mentor (persisted)
- `GET /api/juniors` — list created junior signups
- `POST /api/juniors` — save a junior profile (persisted, pure save)
- `GET /api/health` — status

---

## 2. Shared Data Model

### 2.1 Skill levels

Integers `0-5`, used everywhere a skill has a level:

| Level | Meaning |
| --- | --- |
| 0 | none |
| 1 | beginner |
| 2 | intermediate |
| 3 | working |
| 4 | advanced |
| 5 | expert |

### 2.2 Availability slots

An availability value is one of these exact strings:

```
"weekday-morning" | "weekday-evening" | "weekend"
```

### 2.3 Skill names

Lowercase, hyphenated. Example vocabulary:

```
react, node, express, mongodb, typescript, python, flask, django, flutter,
spring-boot, rest-api, graphql, sql, postgresql, aws, docker, git,
css, tailwind, redux, next-js, vue, java, c-sharp, unity, machine-learning
```

### 2.4 Object schemas

**JuniorProfile** (frontend → backend):

```jsonc
{
  "name": "string",
  "currentSkills": { "skillName": 0 },   // level 0-5; only skills the junior has
  "projectGoal": "string",                // free text, 1-2 sentences
  "availability": ["weekend"]             // array of slot strings
}
```

**ParsedGoal** (produced server-side by the LLM parser, or the mock fallback):

```jsonc
{
  "targetSkills": { "skillName": 3 },     // required level 1-4 per skill (max 6 skills)
  "domain": "frontend"                    // one of: frontend, backend, fullstack, mobile, devops, ml, game-dev, other
}
```

**Mentor** (seed data, returned inside each match):

```jsonc
{
  "id": "m1",
  "name": "Alice Brooks",
  "title": "Senior Frontend Engineer",
  "bio": "One-sentence bio specific to their domain.",
  "skills": { "react": 5, "typescript": 4 },  // level 0-5
  "domains": ["frontend"],
  "availability": ["weekday-evening", "weekend"],
  "currentMentees": 2,
  "maxMentees": 5,
  "avatarInitials": "AL"                        // first two letters of name, uppercase
}
```

**Reason** (one skill-gap contribution inside a match; top 3 per mentor):

```jsonc
{
  "skill": "react",
  "juniorLevel": 0,      // junior's current level for this skill
  "targetLevel": 3,      // level the project requires
  "mentorLevel": 5,      // mentor's level for this skill
  "gap": 3,              // max(0, targetLevel - juniorLevel)
  "contribution": 15     // gap * mentorLevel (sort key, desc)
}
```

**Match** (one ranked result):

```jsonc
{
  "mentor": { /* full Mentor object */ },
  "matchPercent": 87,     // integer 0-100, rounded, capped at 100
  "reasons": [ /* up to 3 Reason objects, sorted by contribution desc */ ]
}
```

**Persona** (demo data returned by `GET /api/personas`):

```jsonc
{
  "id": "p1",
  "name": "React Junior",
  "currentSkills": { "html": 2, "css": 2 },
  "projectGoal": "free text...",
  "availability": ["weekend"]
}
```

---

## 3. `POST /api/match`

Submit a junior profile; receive the parsed goal and the ranked mentor matches.

### Request

`POST http://localhost:5500/api/match`
Header: `Content-Type: application/json`

Body:

```jsonc
{
  "juniorProfile": {
    "name": "Alex Chen",
    "currentSkills": { "html": 2, "css": 2 },
    "projectGoal": "Build a React TypeScript dashboard with Redux state management",
    "availability": ["weekend"]
  }
}
```

> The profile is wrapped under the top-level key `juniorProfile`.

### Success — `200 OK`

```jsonc
{
  "parsedGoal": {
    "targetSkills": { "react": 3, "typescript": 3, "redux": 2, "css": 2 },
    "domain": "frontend"
  },
  "matches": [
    {
      "mentor": {
        "id": "m1",
        "name": "Alice Brooks",
        "title": "Senior Frontend Engineer",
        "bio": "Builds design systems and complex React dashboards at scale.",
        "skills": { "react": 5, "typescript": 4, "redux": 4, "css": 5 },
        "domains": ["frontend"],
        "availability": ["weekday-evening", "weekend"],
        "currentMentees": 2,
        "maxMentees": 5,
        "avatarInitials": "AL"
      },
      "matchPercent": 87,
      "reasons": [
        { "skill": "react", "juniorLevel": 0, "targetLevel": 3, "mentorLevel": 5, "gap": 3, "contribution": 15 },
        { "skill": "typescript", "juniorLevel": 0, "targetLevel": 3, "mentorLevel": 4, "gap": 3, "contribution": 12 },
        { "skill": "redux", "juniorLevel": 0, "targetLevel": 2, "mentorLevel": 4, "gap": 2, "contribution": 8 }
      ]
    }
    // ... up to 3 matches total, sorted by matchPercent desc
  ]
}
```

Notes:
- `matches` has **at most 3** items, sorted by `matchPercent` descending.
- `matches` can be **empty** (`[]`) when no mentor covers any gap, or when the junior already meets all target levels (gap total is zero). The frontend must render a no-matches state.
- `reasons` has **at most 3** items, sorted by `contribution` descending.
- `parsedGoal` is always present, even when `matches` is empty.

### Errors

**`400 Bad Request`** — missing `juniorProfile` or `projectGoal`:

```json
{ "error": "juniorProfile and projectGoal are required" }
```

**`500 Internal Server Error`** — unexpected failure during matching:

```json
{ "error": "Matching failed", "detail": "error message string" }
```

> The LLM parser never causes a hard failure: if the LLM call fails, the backend silently falls back to a deterministic mock parser, so a `200` is still returned. A `500` only indicates an unexpected server bug.

### curl example

```bash
curl -X POST http://localhost:5500/api/match \
  -H "Content-Type: application/json" \
  -d '{"juniorProfile":{"name":"Test","currentSkills":{"html":2,"css":2},"projectGoal":"Build a React TypeScript dashboard","availability":["weekend"]}}'
# Expected: 200 with up to 3 matches, top result matchPercent > 50
```

---

## 4. `GET /api/personas`

Returns the 3 demo personas so the frontend can populate the "Try a demo persona" buttons.

### Request

`GET http://localhost:5500/api/personas`

### Success — `200 OK`

Returns the persona **array directly** (not wrapped in an object):

```jsonc
[
  {
    "id": "p1",
    "name": "React Junior",
    "currentSkills": { "html": 2, "css": 2 },
    "projectGoal": "I want to build a React + TypeScript dashboard with Redux state management.",
    "availability": ["weekend"]
  },
  {
    "id": "p2",
    "name": "Backend Junior",
    "currentSkills": { "python": 2, "rest-api": 1 },
    "projectGoal": "Build a REST API backend with Flask and PostgreSQL for a task management app.",
    "availability": ["weekday-evening"]
  },
  {
    "id": "p3",
    "name": "Full-stack Junior",
    "currentSkills": { "javascript": 2, "node": 1 },
    "projectGoal": "Build a full-stack e-commerce site with Next.js, a Node/Express backend, and MongoDB.",
    "availability": ["weekday-morning", "weekend"]
  }
]
```

(Exact field values come from `backend/data/juniorPersonas.json`; the shape is fixed.)

### Errors

The frontend treats any non-2xx as a failure and shows `"Failed to load demo personas"`. No specific error body is guaranteed.

---

## 4A. Onboarding & persistence endpoints

These create and list mentors and junior signups. Data persists to JSON files in `backend/data/` (`mentors.json`, `juniors.json`), so new records survive restarts and newly onboarded mentors are matchable immediately without a restart. `GET /api/personas` is unrelated to these — it still returns only the 3 demo personas.

### `GET /api/mentors`

Returns the full mentor array (seed + onboarded). Each item is a **Mentor** object (see §2.4).

`200 OK` → `[ { ...Mentor }, ... ]`

### `POST /api/mentors`

Onboard a new mentor. The server generates `id` (incremental, e.g. `m11`) and `avatarInitials` (first two letters of `name`, uppercased). Skill names are normalized to lowercase/hyphenated. Skills outside the known vocabulary are accepted with a server-side warning (they simply won't affect matching).

**Request body:**

```jsonc
{
  "name": "string",              // required, non-empty
  "title": "string",             // required, non-empty
  "bio": "string",               // required, non-empty (one sentence)
  "skills": { "react": 5 },      // required, >= 1 skill; levels are ints 0-5
  "domains": ["frontend"],       // required, >= 1
  "availability": ["weekend"],   // required, >= 1; each of weekday-morning|weekday-evening|weekend
  "maxMentees": 5,               // required, integer >= 1
  "currentMentees": 0            // optional, default 0; integer >= 0 and < maxMentees
}
```

**Success — `201 Created`:** the full created Mentor object, e.g.

```jsonc
{
  "id": "m11",
  "name": "Nina Park",
  "title": "Staff Frontend Engineer",
  "bio": "Leads accessibility and performance for a large React app.",
  "skills": { "react": 5, "typescript": 4 },
  "domains": ["frontend"],
  "availability": ["weekday-evening", "weekend"],
  "currentMentees": 0,
  "maxMentees": 4,
  "avatarInitials": "NI"
}
```

**Errors:**
- `400` — `{ "error": "Invalid mentor payload", "fields": [ "name is required", ... ] }`
- `500` — `{ "error": "Failed to save mentor", "detail": "..." }`

### `GET /api/juniors`

Returns created junior signups only (does **not** include the demo personas).

`200 OK` → `[ { ...Junior }, ... ]`

### `POST /api/juniors`

Save a junior profile. **Pure save** — it does not run matching. To get matches, call `POST /api/match` separately. The server generates `id` (incremental, e.g. `j1`).

**Request body:**

```jsonc
{
  "name": "string",                    // required, non-empty
  "currentSkills": { "css": 2 },       // optional, default {}; levels are ints 0-5
  "projectGoal": "string",             // required, non-empty, <= 500 chars
  "availability": ["weekend"]          // required, >= 1 valid slot
}
```

**Success — `201 Created`:** the created Junior object, e.g.

```jsonc
{
  "id": "j1",
  "name": "Sam Rivera",
  "currentSkills": { "css": 2 },
  "projectGoal": "Build a Flutter app backed by a REST API.",
  "availability": ["weekend"]
}
```

**Errors:**
- `400` — `{ "error": "Invalid junior payload", "fields": [ "projectGoal is required", ... ] }`
- `500` — `{ "error": "Failed to save junior", "detail": "..." }`

---

## 5. How `matchPercent` Is Computed (reference)

So both developers share the same mental model. This is deterministic — the LLM is **not** involved in ranking.

1. **Gap vector:** for each target skill, `gap = max(0, targetLevel - juniorLevel)`; keep only `gap > 0`.
2. **Best possible score:** `bestPossibleScore = Σ (gap * 5)`. If `0`, return no matches.
3. **Per mentor:**
   - `baseScore = Σ (gap * mentorSkillLevel)` over gap skills. If `0`, mentor is excluded.
   - `availabilityOverlap = sharedSlots / unionSlots`.
   - `domainMatch = mentor.domains.includes(parsedGoal.domain) ? 1 : 0`.
   - `loadRatio = currentMentees / maxMentees`.
   - `finalScore = baseScore * (1 + 0.15*availabilityOverlap) * (1 + 0.10*domainMatch) * (1 - 0.10*loadRatio)`.
   - `matchPercent = min(100, round(100 * finalScore / bestPossibleScore))`.
4. **Reasons:** gap skills the mentor has (`mentorLevel > 0`), sorted by `contribution = gap * mentorLevel` desc, top 3.
5. Return top 3 mentors by `matchPercent` desc.

Implication for the frontend: `matchPercent` is a coverage-of-your-gaps score, not a raw skill rating. The gap bars in the "why this match" panel visualize exactly these `juniorLevel / targetLevel / mentorLevel` values from each `reason`.

---

## 6. LLM Provider Note (backend only)

Goal parsing uses a **free-tier LLM via Groq or OpenRouter** (OpenAI-compatible `/chat/completions`), selected by env vars — **not** Claude/Anthropic. This is entirely server-side and does not affect the API contract above. The frontend never calls the LLM and should label the feature provider-neutrally (e.g. "Powered by AI"). See `BACKEND_PLAN.md` §7 for provider/model configuration.

---

## 7. Contract Change Checklist

Before changing any shape here:
1. Update this file.
2. Ping the other developer.
3. Update `FRONTEND_PLAN.md` / `BACKEND_PLAN.md` if the change affects rendering or computation.
4. Re-run the curl test in §3 to confirm the backend still returns the agreed shape.
