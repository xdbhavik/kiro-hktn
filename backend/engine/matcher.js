/**
 * matcher.js — Peer Mentor Matcher core ranking engine.
 *
 * PURE FUNCTION. Zero side effects: no API calls, no file reads, just math.
 * The only I/O in this file lives inside the `require.main === module` self-test
 * block at the bottom, which is not executed when the module is imported.
 *
 * Skill levels are integers 0-5: 0=none, 1=beginner, 2=intermediate,
 * 3=working, 4=advanced, 5=expert.
 */

'use strict';

/**
 * Rank mentors for a junior against a parsed project goal.
 *
 * @param {{ currentSkills: Object<string, number>, availability: string[] }} juniorProfile
 * @param {{ targetSkills: Object<string, number>, domain: string }} parsedGoal
 * @param {Array<Object>} mentorsArray - mentor objects from mentors.json
 * @returns {Array<Object>} up to 3 results sorted by matchPercent descending
 */
function rankMentors(juniorProfile, parsedGoal, mentorsArray) {
  const currentSkills = (juniorProfile && juniorProfile.currentSkills) || {};
  const juniorAvailability = (juniorProfile && juniorProfile.availability) || [];
  const targetSkills = (parsedGoal && parsedGoal.targetSkills) || {};
  const domain = parsedGoal && parsedGoal.domain;
  const mentors = Array.isArray(mentorsArray) ? mentorsArray : [];

  // STEP 1 — Compute the gap vector. Only skills where the junior is below the
  // required target level (gap > 0) are relevant to matching.
  const gap = {};
  for (const skill of Object.keys(targetSkills)) {
    const targetLevel = targetSkills[skill] || 0;
    const juniorLevel = currentSkills[skill] || 0;
    const g = Math.max(0, targetLevel - juniorLevel);
    if (g > 0) {
      gap[skill] = g;
    }
  }
  const gapSkills = Object.keys(gap);

  // STEP 2 — Best possible score: what a perfect (level-5) mentor would score.
  let bestPossibleScore = 0;
  for (const skill of gapSkills) {
    bestPossibleScore += gap[skill] * 5;
  }
  // Junior already meets every target level → nothing to match against.
  if (bestPossibleScore === 0) {
    return [];
  }

  // STEP 3 — Score each mentor.
  const scored = [];
  for (const mentor of mentors) {
    const mentorSkills = mentor.skills || {};

    // a. baseScore = sum of (gap * mentorLevel) across the gap skills.
    let baseScore = 0;
    for (const skill of gapSkills) {
      baseScore += gap[skill] * (mentorSkills[skill] || 0);
    }

    // b. A mentor that covers none of the junior's gaps is excluded entirely.
    if (baseScore === 0) {
      continue;
    }

    // c. Availability overlap = shared slots / union of slots.
    const mentorAvailability = mentor.availability || [];
    const availabilityOverlap = computeOverlapRatio(juniorAvailability, mentorAvailability);

    // d. Domain match is a simple 1/0 flag.
    const domainMatch = domain && Array.isArray(mentor.domains) && mentor.domains.includes(domain) ? 1 : 0;

    // e. Load ratio penalizes mentors who are closer to full capacity.
    const loadRatio = mentor.maxMentees ? mentor.currentMentees / mentor.maxMentees : 0;

    // f. Apply the three multiplier modifiers.
    const finalScore =
      baseScore *
      (1 + 0.15 * availabilityOverlap) *
      (1 + 0.10 * domainMatch) *
      (1 - 0.10 * loadRatio);

    // g + h. Normalize to a percentage and cap at 100.
    let matchPercent = Math.round((100 * finalScore) / bestPossibleScore);
    if (matchPercent > 100) {
      matchPercent = 100;
    }

    // STEP 4 — Build the reasons array (top 3 skill-gap contributions).
    const reasons = gapSkills
      .filter((skill) => (mentorSkills[skill] || 0) > 0)
      .map((skill) => {
        const mentorLevel = mentorSkills[skill] || 0;
        return {
          skill,
          juniorLevel: currentSkills[skill] || 0,
          targetLevel: targetSkills[skill] || 0,
          mentorLevel,
          gap: gap[skill],
          contribution: gap[skill] * mentorLevel,
        };
      })
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3);

    scored.push({ mentor, matchPercent, reasons });
  }

  // STEP 5 — Sort by matchPercent descending and return the top 3.
  scored.sort((a, b) => b.matchPercent - a.matchPercent);
  return scored.slice(0, 3);
}

/**
 * overlapRatio = |A ∩ B| / |A ∪ B|. Returns 0 when both sets are empty.
 */
function computeOverlapRatio(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      shared += 1;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : shared / union;
}

module.exports = { rankMentors };

// ---------------------------------------------------------------------------
// Inline self-test: run `node backend/engine/matcher.js` to verify the engine
// works before wiring it to the API. Not executed when imported as a module.
// ---------------------------------------------------------------------------
if (require.main === module) {
  const mentors = require('../data/mentors.json');
  const personas = require('../data/juniorPersonas.json');

  const junior = personas[0]; // persona 1: the React/TypeScript junior
  const parsedGoal = {
    targetSkills: { react: 3, typescript: 3, redux: 2 },
    domain: 'frontend',
  };

  const results = rankMentors(junior, parsedGoal, mentors);

  console.log('=== matcher.js self-test ===');
  console.log('Junior:', junior.name, '| currentSkills:', junior.currentSkills);
  console.log('Parsed goal:', JSON.stringify(parsedGoal));
  console.log('\nTop matches:');
  for (const r of results) {
    console.log(
      `  ${r.matchPercent}%  ${r.mentor.name} (${r.mentor.title})`
    );
    for (const reason of r.reasons) {
      console.log(
        `      - ${reason.skill}: you ${reason.juniorLevel} -> need ${reason.targetLevel} -> mentor ${reason.mentorLevel} (contrib ${reason.contribution})`
      );
    }
  }

  const top = results[0];
  if (!top) {
    console.error('\nFAIL: expected at least one match, got none.');
    process.exit(1);
  }
  if (top.matchPercent > 50) {
    console.log(`\nPASS: top result matchPercent = ${top.matchPercent} (> 50).`);
  } else {
    console.error(`\nFAIL: top result matchPercent = ${top.matchPercent} (expected > 50).`);
    process.exit(1);
  }
}
