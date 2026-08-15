/**
 * routes/match.js — API routes for Peer Mentor Matcher.
 *
 * Reads and writes all data through the in-memory store (backend/data/store.js)
 * so newly onboarded mentors are matchable immediately, without a restart.
 */

'use strict';

const express = require('express');
const { parseGoal } = require('../engine/goalParser');
const { rankMentors } = require('../engine/matcher');
const { validateMentor, validateJunior } = require('../engine/validation');
const store = require('../data/store');

function createMatchRouter() {
  const router = express.Router();

  // POST /api/match — parse the goal, rank mentors, return matches.
  router.post('/match', async (req, res) => {
    try {
      const juniorProfile = req.body && req.body.juniorProfile;

      // 1. Validate.
      if (!juniorProfile || !juniorProfile.projectGoal) {
        return res.status(400).json({ error: 'juniorProfile and projectGoal are required' });
      }

      // 2. Parse the free-text goal (async, never rejects — falls back to mock).
      const parsedGoal = await parseGoal(juniorProfile.projectGoal);

      // 3. Rank mentors deterministically (reads the live pool from the store).
      const matches = rankMentors(juniorProfile, parsedGoal, store.getMentors());

      // 4. Respond.
      return res.status(200).json({
        parsedGoal: {
          targetSkills: parsedGoal.targetSkills,
          domain: parsedGoal.domain,
        },
        matches,
      });
    } catch (err) {
      // 5. Unexpected failure.
      return res.status(500).json({ error: 'Matching failed', detail: err.message });
    }
  });

  // GET /api/personas — demo personas for the frontend buttons (read-only seed).
  router.get('/personas', (req, res) => {
    return res.status(200).json(store.getPersonas());
  });

  // GET /api/mentors — list all mentors (seed + onboarded).
  router.get('/mentors', (req, res) => {
    return res.status(200).json(store.getMentors());
  });

  // POST /api/mentors — onboard a new mentor.
  router.post('/mentors', async (req, res) => {
    try {
      const { valid, errors, warnings, value } = validateMentor(req.body);
      if (!valid) {
        return res.status(400).json({ error: 'Invalid mentor payload', fields: errors });
      }
      if (warnings && warnings.length > 0) {
        warnings.forEach((w) => console.log('Mentor onboarding warning:', w));
      }

      const mentors = store.getMentors();
      const mentor = {
        id: store.nextId('m', mentors),
        name: value.name,
        title: value.title,
        bio: value.bio,
        skills: value.skills,
        domains: value.domains,
        availability: value.availability,
        currentMentees: value.currentMentees,
        maxMentees: value.maxMentees,
        avatarInitials: makeInitials(value.name),
      };

      await store.addMentor(mentor);
      return res.status(201).json(mentor);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save mentor', detail: err.message });
    }
  });

  // GET /api/juniors — list created junior signups (excludes demo personas).
  router.get('/juniors', (req, res) => {
    return res.status(200).json(store.getJuniors());
  });

  // POST /api/juniors — save a junior profile (pure save, does not run matching).
  router.post('/juniors', async (req, res) => {
    try {
      const { valid, errors, value } = validateJunior(req.body);
      if (!valid) {
        return res.status(400).json({ error: 'Invalid junior payload', fields: errors });
      }

      const juniors = store.getJuniors();
      const junior = {
        id: store.nextId('j', juniors),
        name: value.name,
        currentSkills: value.currentSkills,
        projectGoal: value.projectGoal,
        availability: value.availability,
      };

      await store.addJunior(junior);
      return res.status(201).json(junior);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save junior', detail: err.message });
    }
  });

  return router;
}

/** First two letters of the name, uppercased. Falls back to "NA". */
function makeInitials(name) {
  const letters = String(name).replace(/[^A-Za-z]/g, '');
  return (letters.slice(0, 2) || 'NA').toUpperCase();
}

module.exports = createMatchRouter;
