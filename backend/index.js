// TEST: curl -X POST http://localhost:5500/api/match \
//   -H "Content-Type: application/json" \
//   -d '{"juniorProfile":{"name":"Test","currentSkills":{"html":2,"css":2},"projectGoal":"Build a React TypeScript dashboard","availability":["weekend"]}}'
// Expected: 200 with 3 match results, top result matchPercent > 50

/**
 * index.js — Express bootstrap for the Peer Mentor Matcher backend.
 *
 * - Loads env from .env
 * - Enables CORS for the React dev server (http://localhost:3000)
 * - Loads mentors.json into memory ONCE at startup
 * - Mounts the match router at /api
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const createMatchRouter = require('./routes/match');
const store = require('./data/store'); // owns all data (in-memory + persistence)

const app = express();
const PORT = process.env.PORT || 5500;

// Middleware.
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// Health check (handy for quick smoke tests).
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    mentors: store.getMentors().length,
    personas: store.getPersonas().length,
    juniors: store.getJuniors().length,
  });
});

// API routes.
app.use('/api', createMatchRouter());

// Return a clean 400 for malformed JSON bodies instead of an HTML stack trace.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  return next(err);
});

app.listen(PORT, () => {
  console.log(`Peer Mentor Matcher backend running on port ${PORT}`);
});
