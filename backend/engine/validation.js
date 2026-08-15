/**
 * validation.js — request-body validators for mentor and junior onboarding.
 *
 * Each validator returns { valid, errors, value }:
 *   - valid  : boolean
 *   - errors : array of human-readable messages (empty when valid)
 *   - value  : the normalized payload (skill names lowercased/hyphenated,
 *              strings trimmed) — only meaningful when valid === true
 */

'use strict';

const { SKILL_VOCABULARY } = require('./goalParser');

const AVAILABILITY_SLOTS = ['weekday-morning', 'weekday-evening', 'weekend'];
const VOCAB = new Set(SKILL_VOCABULARY);

function normalizeSkillName(name) {
  return String(name).toLowerCase().trim().replace(/\s+/g, '-');
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isIntInRange(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Validate + normalize a skill map { name: level }. Levels must be ints 0-5.
 * Returns { skills, errors, unknown } where `unknown` lists off-vocabulary
 * skill names (accepted with a warning, per the warn-and-allow decision).
 */
function normalizeSkillMap(input, label) {
  const errors = [];
  const unknown = [];
  const skills = {};

  if (input === undefined || input === null) {
    return { skills, errors, unknown };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    errors.push(`${label} must be an object mapping skill names to levels 0-5`);
    return { skills, errors, unknown };
  }

  for (const [rawName, rawLevel] of Object.entries(input)) {
    const name = normalizeSkillName(rawName);
    if (!name) {
      errors.push(`${label} contains an empty skill name`);
      continue;
    }
    const level = Number(rawLevel);
    if (!isIntInRange(level, 0, 5)) {
      errors.push(`${label}.${name} must be an integer between 0 and 5`);
      continue;
    }
    skills[name] = level;
    if (!VOCAB.has(name)) {
      unknown.push(name);
    }
  }

  return { skills, errors, unknown };
}

function normalizeAvailability(input, errors) {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push('availability must be a non-empty array');
    return [];
  }
  const cleaned = [];
  for (const slot of input) {
    const s = String(slot).toLowerCase().trim();
    if (!AVAILABILITY_SLOTS.includes(s)) {
      errors.push(`availability contains an invalid slot: "${slot}" (allowed: ${AVAILABILITY_SLOTS.join(', ')})`);
      continue;
    }
    if (!cleaned.includes(s)) {
      cleaned.push(s);
    }
  }
  return cleaned;
}

/**
 * Validate a POST /api/mentors body.
 * Returns { valid, errors, value, warnings }.
 */
function validateMentor(body) {
  const errors = [];
  const warnings = [];
  const b = body || {};

  if (!isNonEmptyString(b.name)) errors.push('name is required');
  if (!isNonEmptyString(b.title)) errors.push('title is required');
  if (!isNonEmptyString(b.bio)) errors.push('bio is required');

  const { skills, errors: skillErrors, unknown } = normalizeSkillMap(b.skills, 'skills');
  errors.push(...skillErrors);
  if (Object.keys(skills).length === 0 && skillErrors.length === 0) {
    errors.push('skills must contain at least one skill');
  }
  if (unknown.length > 0) {
    warnings.push(`skills not in the known vocabulary (accepted, but won't affect matching): ${unknown.join(', ')}`);
  }

  let domains = [];
  if (!Array.isArray(b.domains) || b.domains.length === 0) {
    errors.push('domains must be a non-empty array');
  } else {
    domains = b.domains
      .map((d) => String(d).toLowerCase().trim())
      .filter((d) => d.length > 0);
    if (domains.length === 0) {
      errors.push('domains must contain at least one non-empty value');
    }
  }

  const availability = normalizeAvailability(b.availability, errors);

  const maxMentees = Number(b.maxMentees);
  if (!isIntInRange(maxMentees, 1, 1000)) {
    errors.push('maxMentees must be an integer >= 1');
  }

  let currentMentees = b.currentMentees === undefined ? 0 : Number(b.currentMentees);
  if (!Number.isInteger(currentMentees) || currentMentees < 0) {
    errors.push('currentMentees must be an integer >= 0');
    currentMentees = 0;
  } else if (Number.isInteger(maxMentees) && currentMentees >= maxMentees) {
    errors.push('currentMentees must be less than maxMentees');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, value: null };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    value: {
      name: b.name.trim(),
      title: b.title.trim(),
      bio: b.bio.trim(),
      skills,
      domains,
      availability,
      currentMentees,
      maxMentees,
    },
  };
}

/**
 * Validate a POST /api/juniors body.
 * Returns { valid, errors, value }.
 */
function validateJunior(body) {
  const errors = [];
  const b = body || {};

  if (!isNonEmptyString(b.name)) errors.push('name is required');

  if (!isNonEmptyString(b.projectGoal)) {
    errors.push('projectGoal is required');
  } else if (b.projectGoal.trim().length > 500) {
    errors.push('projectGoal must be 500 characters or fewer');
  }

  const { skills, errors: skillErrors } = normalizeSkillMap(b.currentSkills, 'currentSkills');
  errors.push(...skillErrors);

  const availability = normalizeAvailability(b.availability, errors);

  if (errors.length > 0) {
    return { valid: false, errors, value: null };
  }

  return {
    valid: true,
    errors: [],
    value: {
      name: b.name.trim(),
      currentSkills: skills,
      projectGoal: b.projectGoal.trim(),
      availability,
    },
  };
}

module.exports = { validateMentor, validateJunior, AVAILABILITY_SLOTS };
