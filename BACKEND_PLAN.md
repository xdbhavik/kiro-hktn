# Peer Mentor Matcher — Backend Plan

> **Owner:** Backend developer
> **Stack:** Node.js + Express, seed JSON (no database), free-tier LLM (Groq or OpenRouter)
> **This document is self-contained.** You do not need to read the frontend plan to build the backend. The only shared contract is in `API_DOCUMENTATION.md` — keep the request/response shapes identical to what is documented there.

---

## 1. Project Overview

Peer Mentor Matcher pairs junior developers with mentors based on **actual skill gaps**, not tags. A junior submits a profile (current skills + free-text project goal + availability). The backend:

1. Parses the free-text goal with an LLM into a structured `targetSkills` map + `domain`.
2. Computes the junior's skill **gap vector** (what they need minus what they have).
3. Scores every mentor deterministically against that gap vector.
4. Returns the top 3 mentors, each with an explainable list of reasons.

**Key principle:** the LLM is used **only** for parsing free text. All ranking is deterministic math. This keeps results reproducible and demo-safe.

---

## 2. Ground Rules (from `.kiro/steering.md`)

- Backend runs on **port 5000**. Frontend runs on port 3000.
- **No database.** All data lives in `backend/data/` as JSON files, loaded into memory at startup.
- **No authentication, no sessions.**
- The matching engine (`matcher.js`) must be a **pure function** — no API calls, no file reads, just math.
- The LLM is used **only** for goal parsing. Ranking is deterministic.
- All LLM calls are **proxied through the backend**. The frontend never calls the LLM directly (keeps the API key server-side).
- Skill levels are integers: `0=none, 1=beginner, 2=intermediate, 3=working, 4=advanced, 5=expert`.

### LLM provider change (IMPORTANT)

We are **NOT using Claude / Anthropic.** Use a **free-tier model from Groq or OpenRouter**. The user will supply an API key for one of them in `.env`. Both providers expose an **OpenAI-compatible `/chat/completions` endpoint**, so a single code path handles both, switched by an env variable.

| Provider   | Base URL                                          | Example free model                          | Auth header             |
| ---------- | ------------------------------------------------- | ------------------------------------------- | ----------------------- |
| Groq       | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.3-70b-versatile`                   | `Authorization: Bearer` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions`   | `meta-llama/llama-3.3-70b-instruct:free`    | `Authorization: Bearer` |

> Model names may change over time. If a model is deprecated, swap in another current free model from the same provider. Groq alternatives: `llama-3.1-8b-instant`, `gemma2-9b-it`. OpenRouter alternatives: `deepseek/deepseek-chat-v3-0324:free`, `google/gemini-2.0-flash-exp:free`.

---

## 3. Folder Structure (backend portion)

```
peer-mentor-matcher/
├── .kiro/
│   ├── specs/matching-engine/{requirements.md, design.md, tasks.md}
│   └── steering.md
├── backend/
│   ├── data/
│   │   ├── mentors.json        # seed + onboarded mentors (mutable)
│   │   ├── juniorPersonas.json # 3 demo personas (read-only)
│   │   ├── juniors.json        # created junior signups (mutable, starts [])
│   │   └── store.js            # in-memory cache + atomic JSON persistence
│   ├── engine/
│   │   ├── goalParser.js      # LLM parse + mock fallback
│   │   ├── matcher.js         # pure scoring function
│   │   └── validation.js      # mentor/junior payload validators
│   ├── routes/
│   │   └── match.js           # match, personas, mentors, juniors routes
│   ├── .env                   # real keys (gitignored)
│   ├── .env.example
│   └── index.js               # Express bootstrap
├── package.json               # root, runs both servers concurrently
└── README.md
```

Root `package.json` scripts:

```json
{
  "name": "peer-mentor-matcher",
  "scripts": {
    "dev": "concurrently \"npm run server\" \"npm run client\"",
    "server": "cd backend && node index.js",
    "client": "cd frontend && npm start"
  },
  "devDependencies": { "concurrently": "^8.2.2" }
}
```

Backend packages to install (`cd backend && npm init -y && npm install ...`): `express`, `cors`, `dotenv`. Use native `fetch` (Node 18+); if Node < 18, install `node-fetch` and import it.

---

## 4. Skill Vocabulary

The seed data must collectively cover these skills with no gaps:

```
react, node, express, mongodb, typescript, python, flask, django, flutter,
spring-boot, rest-api, graphql, sql, postgresql, aws, docker, git,
css, tailwind, redux, next-js, vue, java, c-sharp, unity, machine-learning
```

All skill names are **lowercase, hyphenated** (e.g. `rest-api`, `next-js`, `machine-learning`).

---

## 5. Seed Data

### 5.1 `backend/data/mentors.json` — exactly 10 mentors

Schema per mentor:

```jsonc
{
  "id": "string",
  "name": "string",
  "title": "string",
  "bio": "string",                 // one sentence, specific to their domain
  "skills": { "skillName": 0 },    // 0-5 scale
  "domains": ["mobile", "backend"],
  "availability": ["weekday-morning", "weekday-evening", "weekend"], // subset of these 3
  "currentMentees": 0,
  "maxMentees": 0,                 // must be > currentMentees (nobody fully booked)
  "avatarInitials": "AB"           // first two letters of name, uppercase
}
```

Distribute the 10 mentors so the full skill vocabulary is covered:

- **2 frontend specialists** — react, typescript, css, tailwind, redux, next-js
- **2 backend specialists** — node, express, python, flask, rest-api, sql
- **2 full-stack** — react, node, express, mongodb, typescript, postgresql
- **1 mobile** — flutter, dart, rest-api
- **1 DevOps/Cloud** — docker, aws, git, postgresql
- **1 Python/ML** — python, django, machine-learning, sql
- **1 Java/Spring** — java, spring-boot, rest-api, sql, docker

Constraints: no mentor has `currentMentees >= maxMentees`. `avatarInitials` = first two uppercase letters of the name.

### 5.2 `backend/data/juniorPersonas.json` — exactly 3 personas

Schema per persona:

```jsonc
{
  "id": "string",
  "name": "string",
  "currentSkills": { "skillName": 0 },  // only skills they actually have
  "projectGoal": "string",              // free text, 1-2 sentences
  "availability": ["weekend"]
}
```

The 3 required personas (designed so each yields 3+ strong matches):

1. **Frontend junior** — knows basic HTML/CSS (level 2); wants a React + TypeScript dashboard with Redux state management. Lacks: react, typescript, redux.
2. **Backend junior** — knows basic Python (level 2); wants a REST API backend with Flask + PostgreSQL for a task management app. Lacks: flask, postgresql; has rest-api at low level (1).
3. **Full-stack junior** — knows some JavaScript (level 2); wants a full-stack e-commerce site with Next.js, Node/Express, and MongoDB. Lacks: next-js, express, mongodb; has node at level 1.

---

## 6. Matching Engine — `backend/engine/matcher.js`

**Pure function. Zero side effects. No I/O.** Exports:

```js
rankMentors(juniorProfile, parsedGoal, mentorsArray) // → Array (max 3)
```

Parameters:

- `juniorProfile`: `{ currentSkills: { [skill]: number }, availability: string[] }`
- `parsedGoal`: `{ targetSkills: { [skill]: number }, domain: string }`
- `mentorsArray`: array of mentor objects

Return: array of up to 3 results, sorted by `matchPercent` descending:

```jsonc
[
  {
    "mentor": { /* full mentor object */ },
    "matchPercent": 87,          // 0-100, rounded, capped at 100
    "reasons": [                 // top 3, sorted by contribution desc
      {
        "skill": "react",
        "juniorLevel": 0,
        "targetLevel": 3,
        "mentorLevel": 5,
        "gap": 3,
        "contribution": 15       // gap * mentorLevel
      }
    ]
  }
]
```

### Algorithm — implement in exactly this order

**STEP 1 — Gap vector.** For each skill in `parsedGoal.targetSkills`:
`gap[skill] = Math.max(0, targetSkills[skill] - (juniorProfile.currentSkills[skill] || 0))`. Keep only skills where `gap > 0`.

**STEP 2 — Best possible score.** `bestPossibleScore = Σ (gap[skill] * 5)` over the gap vector. If `bestPossibleScore === 0`, return `[]` immediately (junior already has everything).

**STEP 3 — Score each mentor:**
- a. `baseScore = Σ (gap[skill] * (mentor.skills[skill] || 0))` over gap skills.
- b. If `baseScore === 0`, **skip** this mentor (covers none of the gaps).
- c. `availabilityOverlap = (# slots in both) / (# unique slots across both)`.
- d. `domainMatch = (parsedGoal.domain && mentor.domains.includes(parsedGoal.domain)) ? 1 : 0`.
- e. `loadRatio = mentor.currentMentees / mentor.maxMentees`.
- f. `finalScore = baseScore * (1 + 0.15 * availabilityOverlap) * (1 + 0.10 * domainMatch) * (1 - 0.10 * loadRatio)`.
- g. `matchPercent = Math.round(100 * finalScore / bestPossibleScore)`.
- h. Cap `matchPercent` at 100.

**STEP 4 — Reasons.** For each surviving mentor: take all gap-vector skills where `mentor.skills[skill] > 0`, map to `{ skill, juniorLevel, targetLevel, mentorLevel, gap, contribution: gap * mentorLevel }`, sort by `contribution` desc, take top 3.

**STEP 5 — Sort & return.** Sort all results by `matchPercent` desc, return top 3.

### Inline self-test

At the bottom, inside `if (require.main === module) { ... }`:
- import `mentors.json`,
- use a hardcoded `parsedGoal = { targetSkills: { react: 3, typescript: 3, redux: 2 }, domain: "frontend" }`,
- use persona 1's `currentSkills`/`availability`,
- call `rankMentors`, `console.log` results,
- assert the top result has `matchPercent > 50`.

Run with `node backend/engine/matcher.js` to verify before wiring the API.

---

## 7. Goal Parser — `backend/engine/goalParser.js`

Exports one async function that **never rejects**:

```js
async function parseGoal(projectGoalText) // → { targetSkills: {...}, domain: "..." }
```

### PART A — Real LLM parser (`parseWithLLM`)

Reads provider config from env and calls an OpenAI-compatible chat completions endpoint.

```js
// Provider resolution
const PROVIDER = process.env.LLM_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "openrouter");

const CONFIG = {
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    model: process.env.LLM_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
  },
};
```

Request body (same shape for both providers):

```js
{
  model: cfg.model,
  max_tokens: 500,
  temperature: 0,                       // deterministic parsing
  response_format: { type: "json_object" }, // ask for strict JSON when supported
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: projectGoalText }
  ]
}
```

Headers:

```js
{
  "Authorization": `Bearer ${cfg.key}`,
  "Content-Type": "application/json"
  // OpenRouter optionally accepts "HTTP-Referer" and "X-Title" headers; not required.
}
```

**System prompt (use exactly):**

```
You are a skill extraction engine. Given a junior developer's project goal, extract the technical skills required and the project domain.

Respond ONLY with a valid JSON object. No explanation, no markdown, no backticks.
Format:
{
  "targetSkills": {
    "skill-name": requiredLevel
  },
  "domain": "string"
}

Skill names must be lowercase, hyphenated (e.g. "rest-api", "next-js", "machine-learning").
Required levels use this scale: 1=beginner, 2=intermediate, 3=working knowledge, 4=advanced.
Domain must be one of: frontend, backend, fullstack, mobile, devops, ml, game-dev, other.
Extract only the skills that are central to building the described project. Maximum 6 skills.
```

Parse the response: read `data.choices[0].message.content`, `JSON.parse` it, and return it. (Note: OpenAI-compatible responses use `choices[0].message.content` — this differs from Anthropic's `content[0].text`.) Strip stray markdown fences defensively before parsing in case a model ignores the JSON instruction.

If the HTTP status is not OK, or the key is missing, or parsing fails → **throw** so `parseGoal` falls back to the mock.

### PART B — Mock fallback (`parseWithMock`)

Case-insensitive keyword matching on `projectGoalText.toLowerCase()`. Check in this order and return the first match:

| Contains any of                                            | Returns                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `react`, `dashboard`, `typescript`                         | `{ targetSkills: { react:3, typescript:3, redux:2, css:2 }, domain:"frontend" }`     |
| `flask`, `django`, `python`, `task management`             | `{ targetSkills: { python:3, flask:3, "rest-api":3, postgresql:2 }, domain:"backend" }` |
| `next`, `nextjs`, `next.js`, `e-commerce`, `ecommerce`     | `{ targetSkills: { "next-js":3, node:3, express:2, mongodb:2 }, domain:"fullstack" }`|
| `flutter`, `mobile`, `android`, `ios`                      | `{ targetSkills: { flutter:3, "rest-api":2 }, domain:"mobile" }`                     |
| `spring`, `java`, `microservice`                           | `{ targetSkills: { java:3, "spring-boot":3, "rest-api":3, sql:2 }, domain:"backend" }`|
| `machine learning`, `ml`, `ai model`, `neural`             | `{ targetSkills: { python:3, "machine-learning":4, sql:2 }, domain:"ml" }`           |
| _default (nothing matched)_                                | `{ targetSkills: { node:2, express:2, "rest-api":2 }, domain:"backend" }`            |

### PART C — Exported `parseGoal`

```js
async function parseGoal(text) {
  try {
    const result = await parseWithLLM(text);
    if (result && result.targetSkills && Object.keys(result.targetSkills).length) {
      return result;
    }
    throw new Error("Empty/invalid LLM result");
  } catch (err) {
    console.log("LLM parser failed, using mock fallback:", err.message);
    return parseWithMock(text);
  }
}
```

The app must never crash because of the parser.

### Env files

`backend/.env.example` (and a real `backend/.env` with the same keys, actual key filled in manually):

```
# Choose ONE provider. LLM_PROVIDER is optional; if omitted it is inferred from which key is set.
LLM_PROVIDER=groq            # or: openrouter
GROQ_API_KEY=your_groq_key_here
OPENROUTER_API_KEY=your_openrouter_key_here
LLM_MODEL=                   # optional override; leave blank to use the provider default
PORT=5000
```

Add `.env` to `.gitignore`.

---

## 8. Express Server — `backend/index.js`

- Load env via `dotenv`.
- Create Express app; enable CORS for `http://localhost:3000`; parse JSON bodies.
- Load `mentors.json` into memory **once at startup**; pass it to the router (do not re-read per request).
- Mount the match router at `/api`.
- Listen on `process.env.PORT || 5000`.
- On startup log: `Peer Mentor Matcher backend running on port 5000`.

Add this test comment at the top of the file:

```js
// TEST: curl -X POST http://localhost:5500/api/match \
//   -H "Content-Type: application/json" \
//   -d '{"juniorProfile":{"name":"Test","currentSkills":{"html":2,"css":2},"projectGoal":"Build a React TypeScript dashboard","availability":["weekend"]}}'
// Expected: 200 with 3 match results, top result matchPercent > 50
```

---

## 9. Routes — `backend/routes/match.js`

Export an Express `Router` factory (`createMatchRouter()`, no args) that reads and writes all data through the store (`backend/data/store.js`). Reading mentors from the store at request time means newly onboarded mentors are matchable live.

Routes: `POST /match`, `GET /personas`, `GET /mentors`, `POST /mentors`, `GET /juniors`, `POST /juniors`. The onboarding/persistence routes and their schemas are fully specified in `UPDATE.md` and `API_DOCUMENTATION.md` §4A.

### `POST /match`

Request body:

```jsonc
{
  "juniorProfile": {
    "name": "string",
    "currentSkills": { "skill": 0 },
    "projectGoal": "string",
    "availability": ["weekend"]
  }
}
```

Handler order:
1. Validate: if `juniorProfile` or `juniorProfile.projectGoal` is missing → `400 { error: "juniorProfile and projectGoal are required" }`.
2. `const parsedGoal = await parseGoal(juniorProfile.projectGoal)`.
3. `const matches = rankMentors(juniorProfile, parsedGoal, store.getMentors())` (sync).
4. `200 { parsedGoal: { targetSkills, domain }, matches }`.
5. Wrap in try/catch → on error `500 { error: "Matching failed", detail: err.message }`.

### `GET /personas`

Return `200` with the full `juniorPersonas.json` array directly.

---

## 10. Kiro Spec Files (`.kiro/specs/matching-engine/`)

Reflect the LLM provider change (Groq/OpenRouter, no Claude) in these:

- **`requirements.md`** — the 9 numbered requirements. Requirement #2 should read: "parse the projectGoal text using a free-tier LLM (Groq or OpenRouter) to extract a targetSkills map and a domain string." Requirement #3: hardcoded mock parser fallback if the LLM call fails.
- **`design.md`** — pipeline: `free text → LLM parser → gap vector → scorer → ranker → explainer → API response`; data flow across `goalParser.js`, `matcher.js`, `routes/match.js`.
- **`tasks.md`** — the checklist (seed mentors, seed personas, goalParser real+mock, pure matcher, POST /api/match, onboarding form, results page, wire frontend).

`.kiro/steering.md` — same rules as Section 2 above (with the LLM provider set to Groq/OpenRouter, not Claude).

---

## 11. Backend Definition of Done

- [ ] `backend/data/mentors.json` — 10 mentors, full skill coverage, none fully booked.
- [ ] `backend/data/juniorPersonas.json` — 3 personas as specified.
- [ ] `node backend/engine/matcher.js` runs and the inline test passes (top match > 50%).
- [ ] `goalParser.js` works with a real key AND gracefully falls back to mock when the key is absent/invalid.
- [ ] `node backend/index.js` boots and logs the startup line.
- [ ] The curl test in Section 8 returns 200 with 3 matches, top > 50%.
- [ ] `GET /api/personas` returns the 3 personas.
- [ ] `.env` is gitignored; `.env.example` is committed.
- [ ] Response shapes match `API_DOCUMENTATION.md` exactly.

### Onboarding & persistence (added — see `UPDATE.md`)

- [ ] `backend/data/store.js` loads mentors/personas/juniors into memory and persists writes atomically.
- [ ] `backend/data/juniors.json` exists (starts as `[]`).
- [ ] `POST /api/mentors` validates, generates `id` + `avatarInitials`, persists, and returns `201`.
- [ ] A mentor added via `POST /api/mentors` is matchable by `POST /api/match` without a restart.
- [ ] `POST /api/juniors` validates, persists (pure save), and returns `201`.
- [ ] `GET /api/mentors` and `GET /api/juniors` list current data.
- [ ] Invalid payloads return `400 { error, fields }`.
