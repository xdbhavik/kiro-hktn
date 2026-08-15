/**
 * api.js — thin wrapper around the backend endpoints.
 * Requests use relative paths; CRA's dev proxy forwards /api/* to :5000.
 */

/**
 * Submit a junior profile and get { parsedGoal, matches }.
 * @param {Object} juniorProfile { name, currentSkills, projectGoal, availability }
 */
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

/**
 * Persist a junior profile (pure save, no matching). Returns the created record.
 * Non-critical: callers may ignore failures so onboarding still proceeds.
 * @param {Object} juniorProfile { name, currentSkills, projectGoal, availability }
 */
export async function saveJunior(juniorProfile) {
  const response = await fetch('/api/juniors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(juniorProfile),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${response.status}`);
  }
  return response.json();
}

/** Load the demo personas for the onboarding buttons. */
export async function fetchPersonas() {
  const response = await fetch('/api/personas');
  if (!response.ok) throw new Error('Failed to load demo personas');
  return response.json();
}
