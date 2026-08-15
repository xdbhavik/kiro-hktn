# Peer Mentor Matcher — Frontend Plan

> **Owner:** Frontend developer
> **Stack:** React (Create React App) + React Router + axios/fetch, port 3000
> **This document is self-contained.** You do not need to read the backend plan to build the frontend. The only thing you share with the backend developer is the HTTP contract in `API_DOCUMENTATION.md` — treat that as the source of truth for request/response shapes.

---

## 1. Project Overview

Peer Mentor Matcher pairs junior developers with mentors based on **actual skill gaps**, not tags. The frontend is a two-screen flow:

1. **Onboarding page (`/`)** — the junior enters name, project goal (free text), current skills, and availability. They can also load one of 3 demo personas with a click.
2. **Results page (`/results`)** — shows the AI-detected required skills plus the top 3 ranked mentors, each with an explainable "why this match" panel (gap bars), availability overlap, capacity, and a demo "Request Mentorship" button.

The frontend calls exactly two backend endpoints (see `API_DOCUMENTATION.md`):
- `POST /api/match` — submit the profile, get parsed goal + ranked matches.
- `GET /api/personas` — load the 3 demo personas for the buttons.

> **Note on the LLM:** the goal is parsed server-side by a free-tier LLM (Groq or OpenRouter — **not Claude**). The frontend never calls any LLM directly; it only talks to our backend. For UI copy, use a provider-neutral phrase like **"Powered by AI"** rather than naming Claude.

---

## 2. Ground Rules

- Frontend runs on **port 3000**; backend on 5000.
- No external component/UI libraries — **pure CSS only** (styling from the CSS variables below).
- Dark theme throughout.
- A CRA dev proxy forwards `/api/*` to the backend, so use relative paths like `/api/match`.

---

## 3. Folder Structure (frontend portion)

```
frontend/
├── public/
├── src/
│   ├── components/
│   │   ├── Navbar.jsx
│   │   └── SkillTag.jsx
│   ├── pages/
│   │   ├── OnboardingPage.jsx
│   │   └── ResultsPage.jsx
│   ├── services/
│   │   └── api.js
│   ├── App.jsx
│   ├── ErrorBoundary.jsx
│   ├── index.js
│   ├── index.css
│   └── App.css
└── package.json          # add "proxy": "http://localhost:5500"
```

### Setup steps

1. `npx create-react-app frontend`
2. Delete defaults: `src/App.test.js`, `src/logo.svg`, `src/reportWebVitals.js`, `src/setupTests.js`. Clear `App.css`. Replace `index.css` (see Section 4).
3. Add `"proxy": "http://localhost:5500"` to `frontend/package.json`.
4. Install: `axios`, `react-router-dom`.

---

## 4. Base Styles — `src/index.css`

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #0f0f13; color: #e8e8e8; min-height: 100vh;
  padding-top: 56px;              /* room for the fixed navbar */
}
:root {
  --primary: #7c6af7;
  --primary-light: #a99ef9;
  --surface: #1a1a24;
  --surface-2: #22222e;
  --border: #2e2e3e;
  --text: #e8e8e8;
  --text-muted: #8888a4;
  --success: #4ade80;
  --gap-color: #f97316;
}
```

Skill-level color coding used across pages:
- `0-1` → `#ef4444` (red)
- `2-3` → `#f97316` (orange)
- `4-5` → `#4ade80` (green)

---

## 5. App Shell & Routing — `src/App.jsx`

Use `react-router-dom` (`BrowserRouter`, `Routes`, `Route`, `useNavigate`). Two routes:
- `"/"` → `OnboardingPage`
- `"/results"` → `ResultsPage`

App-level state:
- `juniorProfile` (null initially) — the submitted form data.
- `matchResults` (null initially) — the API response `{ parsedGoal, matches }`.
- `loading` (false), `error` (null).

Handlers:

```js
async function handleSubmit(juniorProfile) {
  setLoading(true); setError(null);
  try {
    const result = await submitProfile(juniorProfile); // from services/api.js
    setMatchResults(result);
    setJuniorProfile(juniorProfile);
    navigate('/results');
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}

function handleStartOver() {
  setJuniorProfile(null); setMatchResults(null); setError(null);
  navigate('/');
}
```

Props passed down:
- `OnboardingPage` receives `onSubmit={handleSubmit}`.
- `ResultsPage` receives `matchResults`, `juniorProfile`, `onStartOver={handleStartOver}`.

Render logic:
- if `loading` → `<LoadingScreen />`
- if `error` → `<ErrorScreen error={error} onRetry={handleStartOver} />`
- else → render routes.

**LoadingScreen (inline):** full-screen centered, dark background, an animated pulsing circle (CSS keyframes, `--primary`), text `"Finding your best mentors..."`, subtext `"Analyzing skill gaps and ranking matches"`.

**ErrorScreen (inline):** full-screen centered, red warning icon, title `"Something went wrong"`, the error message, and a `"Try Again"` button that resets error state and navigates to `/`.

> `useNavigate` only works inside a `BrowserRouter`. Structure `App` so the component using `useNavigate` is rendered within the router (e.g. an inner `AppRoutes` component wrapped by `BrowserRouter`).

---

## 6. API Service — `src/services/api.js`

```js
export async function submitProfile(juniorProfile) {
  const response = await fetch('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ juniorProfile }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${response.status}`);
  }
  return response.json();
}

export async function fetchPersonas() {
  const response = await fetch('/api/personas');
  if (!response.ok) throw new Error('Failed to load demo personas');
  return response.json();
}
```

(You may use axios instead of fetch — keep the same behavior: throw on non-2xx, return parsed data.)

---

## 7. Data Shapes You Will Render

You do not build these — the backend produces them — but you render them. Full detail in `API_DOCUMENTATION.md`.

**`matchResults`:**

```jsonc
{
  "parsedGoal": {
    "targetSkills": { "react": 3, "typescript": 3, "redux": 2 },
    "domain": "frontend"
  },
  "matches": [
    {
      "mentor": {
        "id": "m1", "name": "Alice Brooks", "title": "Senior Frontend Engineer",
        "bio": "…", "skills": { "react": 5, "typescript": 4 },
        "domains": ["frontend"], "availability": ["weekday-evening", "weekend"],
        "currentMentees": 2, "maxMentees": 5, "avatarInitials": "AL"
      },
      "matchPercent": 87,
      "reasons": [
        { "skill": "react", "juniorLevel": 0, "targetLevel": 3, "mentorLevel": 5, "gap": 3, "contribution": 15 }
      ]
    }
  ]
}
```

`matches` can be empty (`[]`) — handle the no-matches state.

**Persona (from `GET /api/personas`):**

```jsonc
{
  "id": "p1", "name": "React Junior",
  "currentSkills": { "html": 2, "css": 2 },
  "projectGoal": "…free text…",
  "availability": ["weekend"]
}
```

Skill levels everywhere are integers `0-5`: `0=none, 1=beginner, 2=intermediate, 3=working, 4=advanced, 5=expert`.

---

## 8. Onboarding Page — `src/pages/OnboardingPage.jsx`

Props: `{ onSubmit }`. Single scrollable page, max-width 680px, centered.

State: `name`, `projectGoal`, `availability` (string[]), `skills` (`{ [name]: number }`, starts empty), `newSkillName`, `newSkillLevel` (1-5, default 1), `personas` (loaded from `GET /api/personas` on mount), `selectedPersona` (string | null).

Sections:

1. **Header** — title `"Find Your Mentor"`, subtitle `"Tell us about yourself and what you're building"`.
2. **Demo personas** — label `"Try a demo persona"`; 3 buttons labeled `persona.name`. On click: populate all form fields from that persona and set `selectedPersona`. Active button gets a `--primary` border.
3. **Your name** — text input, placeholder `"e.g. Alex Chen"`, required.
4. **Project goal** — textarea `rows=4`, placeholder `"Describe what you're building. E.g.: I want to build a movie discovery app using Flutter for mobile with a Spring Boot REST API backend."`, required, with a character count `current/500` below.
5. **Current skills** — label `"What skills do you already have? (Rate 0–5)"`.
   - Existing skills list; each row: skill name (non-editable), a range slider (`min=0 max=5 step=1`, `accent-color: var(--primary)`), a number badge (color-coded per Section 4), and a remove `×` button.
   - "Add skill" row: text input (auto-lowercase, spaces→hyphens; placeholder `"e.g. react, python, sql"`), a 1-5 level selector, an "Add" button. Add only if the name is non-empty and not already present. **Enter in the name input triggers Add.**
6. **Availability** — label `"When are you usually available?"`; 3 checkboxes (multi-select): `"Weekday mornings"→weekday-morning`, `"Weekday evenings"→weekday-evening`, `"Weekends"→weekend`.
7. **Submit** — button `"Find My Mentors →"`, full width, primary background. Disabled if `name` empty OR `projectGoal` empty OR `availability` empty. On click: `onSubmit({ name, currentSkills: skills, projectGoal, availability })`.

**"How it works" footer** (below submit) — a collapsed toggle `"How does the matching work? ▾"`. Expanded, shows 3 steps:
1. "Your project goal is parsed by AI to extract required skills"
2. "We compute your skill gaps: the difference between where you are and where your project needs you to be"
3. "Mentors are ranked by how well they cover your specific gaps — not just their overall skill level"

Styling: each section is a card (`background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 12px`, `padding: 24px`), sections spaced 16px apart. Inputs: `background: var(--surface-2)`, `border: var(--border)`, `color: var(--text)`, `border-radius: 8px`, `padding: 10px 14px`.

---

## 9. Results Page — `src/pages/ResultsPage.jsx`

Props: `{ matchResults, juniorProfile, onStartOver }`. This is the demo centerpiece.

**Demo-mode banner** (below navbar): `background: rgba(124,106,247,0.1)`, `border: 1px solid rgba(124,106,247,0.3)`, text `"🎯 Demo Mode — Mentors are seeded profiles. In production, real mentors would onboard through a separate portal."`

**Section 1 — Header bar:** left `"← Start Over"` (calls `onStartOver`, navigates `/`); center title `"Your Mentor Matches"`; right the junior's name + `for: [projectGoal truncated to 60 chars]…`.

**Section 2 — Parsed goal summary card:** subtle gradient `var(--surface) → var(--surface-2)`. Label `"AI detected these required skills from your project goal:"`. A domain badge `"Domain: [domain]"` (primary background). One `SkillTag` per `targetSkill` showing `[skill] → Level [n]` with a colored dot (green 1-2, yellow 3, orange 4-5) and a hover tooltip `"Required level: [n]/5"`. Small caption: `"Match % = how well each mentor covers your specific skill gaps"`.

**Section 3 — Match cards (one per result, max 3):** each card contains:

- **A. Header row** — left: avatar circle with `avatarInitials`, background color by `matchPercent` (>80 green, 60-80 orange, <60 red). Center: mentor name (large) + title (small, muted). Right: match badge — big number + `"% match"`, same color coding.
- **B. Bio** — one sentence, muted.
- **C. "Why this match"** (centerpiece) — label with a sparkle `✦`. For each reason, a row with:
  - skill name (bold, capitalized, hyphens→spaces);
  - a **gap bar** of 5 squares (18×18px, `border-radius: 3px`, 3px gap):
    - squares `0 … juniorLevel-1`: filled `--text-muted` (already has),
    - squares `juniorLevel … targetLevel-1`: filled `--gap-color` (the gap),
    - squares `targetLevel … mentorLevel-1`: filled `--primary` (mentor coverage above target),
    - remaining: empty/dark;
  - a legend below: `"You: [juniorLevel] → Needed: [targetLevel] → Mentor: [mentorLevel]/5"`.
- **D. Availability row** — overlapping slots (present in both junior and mentor) shown with a green `✓`; non-overlapping mentor slots with a grey dot. e.g. `"Weekday evenings ✓  Weekends ✓"`.
- **E. Capacity row** — `"Mentoring [currentMentees]/[maxMentees] juniors"` plus a small horizontal load progress bar.
- **F. "Request Mentorship" button** — full width, outlined (`border: var(--primary)`, transparent bg, `color: var(--primary)`). On click: alert/inline message `"Mentorship request sent to [mentor name]! (Demo mode)"`.

**Section 4 — No-matches state** (when `matches` is empty): icon `🔍`, title `"No strong matches found"`, text `"Try adjusting your skills — if you already have most required skills, the gap may be too small to match."`, button `"← Go Back"`.

Styling: each card `background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 16px`, `padding: 28px`, `margin-bottom: 20px`. The #1 card gets `border-top: 3px solid var(--primary)`. Animate cards in on mount with a `fadeInUp` CSS keyframe, 0.1s stagger between cards. Mobile: below 600px, stack the header row vertically.

---

## 10. Shared Components

**`src/components/Navbar.jsx`** — fixed top bar, height 56px, `background: var(--surface)`, `border-bottom: 1px solid var(--border)`. Left: a small purple circle icon + `"PeerMatch"` (white, semi-bold). Right (results page only): a `"Powered by AI"` badge in small text with a subtle border. (Remember `body { padding-top: 56px }` is already set.)

**`src/components/SkillTag.jsx`** — props `{ skill, level, variant }`, `variant ∈ { target(purple), gap(orange), covered(green), neutral(grey) }`. Renders a pill with the skill name and a level dot. Reuse in OnboardingPage (current skills) and ResultsPage (parsed goal display).

---

## 11. Error Boundary — `src/ErrorBoundary.jsx`

Class component that catches render errors and shows a fallback: `"Something broke. Please refresh."` Wrap `<App />` in it inside `src/index.js`.

---

## 12. Accessibility

- All interactive elements focusable and keyboard-operable.
- Form submits on Enter in the last input; "Add skill" triggers on Enter in the skill-name input.
- Skill sliders expose their value via `aria-label`.

---

## 13. Frontend Definition of Done

- [ ] `npm start` in `frontend/` runs with no console errors; `/api/*` proxies to port 5000.
- [ ] All 3 demo persona buttons populate every form field correctly.
- [ ] Manual skill add/remove works; names auto-lowercase and hyphenate.
- [ ] Submit button disabled until name, projectGoal, and availability are all set.
- [ ] Submitting shows the LoadingScreen, then navigates to Results.
- [ ] Results page renders the parsed goal card + up to 3 mentor cards with correct color-coded match %, gap bars, availability, and capacity.
- [ ] Gap bars correctly split junior / gap / mentor-coverage segments.
- [ ] Empty `matches` shows the no-matches state.
- [ ] "Request Mentorship" shows the demo confirmation.
- [ ] "← Start Over" clears state and returns to the form.
- [ ] No layout breaks at 375px width.
- [ ] UI copy says "AI" / "Powered by AI" (never names Claude).

---

## 14. Demo Script (for reference)

**Problem** — juniors get matched on tags, not real skill gaps.
**Solution** — click persona 1 (React junior), show the populated form.
**AI part** — click "Find My Mentors"; while loading, the goal is parsed server-side into target skill levels.
**Differentiator** — point at the gap bars on the top match: it shows exactly which skills the mentor covers, at what level, and why they ranked highest.
**Roadmap** — real mentor onboarding, richer backend, mobile app, scheduling.
