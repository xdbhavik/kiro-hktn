/**
 * store.js — in-memory data store with JSON-file persistence.
 *
 * The JSON files in backend/data/ are the "database". This module loads them
 * into memory once at startup, serves all reads from memory, and on create
 * appends to memory AND persists the full array back to disk (atomically).
 * New mentors therefore become matchable immediately, without a restart.
 *
 * Storage layout:
 *   mentors.json        - seed + created mentors  (mutable)
 *   juniorPersonas.json - demo personas only      (read-only)
 *   juniors.json        - created junior signups  (mutable, starts as [])
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const MENTORS_FILE = path.join(DATA_DIR, 'mentors.json');
const PERSONAS_FILE = path.join(DATA_DIR, 'juniorPersonas.json');
const JUNIORS_FILE = path.join(DATA_DIR, 'juniors.json');

// In-memory caches.
let mentors = [];
let personas = [];
let juniors = [];

// Serializes all disk writes so rapid creates can't interleave and clobber.
let writeChain = Promise.resolve();

function readJsonSync(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
}

/** Load all data files into memory. Called once at startup. */
function init() {
  mentors = readJsonSync(MENTORS_FILE, []);
  personas = readJsonSync(PERSONAS_FILE, []);
  juniors = readJsonSync(JUNIORS_FILE, []);
  return { mentors: mentors.length, personas: personas.length, juniors: juniors.length };
}

/** Atomic, queued write: write to a temp file then rename over the target. */
function persist(file, data) {
  writeChain = writeChain.then(
    () =>
      new Promise((resolve, reject) => {
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', (writeErr) => {
          if (writeErr) return reject(writeErr);
          fs.rename(tmp, file, (renameErr) => (renameErr ? reject(renameErr) : resolve()));
        });
      })
  );
  return writeChain;
}

/**
 * Generate the next incremental id for a prefix (e.g. "m" -> "m11").
 * Falls back to "<prefix>-<timestamp>" if the computed id already exists.
 */
function nextId(prefix, list) {
  let max = 0;
  const existing = new Set();
  for (const item of list) {
    const id = item && item.id ? String(item.id) : '';
    existing.add(id);
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (match) {
      max = Math.max(max, parseInt(match[1], 10));
    }
  }
  let id = `${prefix}${max + 1}`;
  if (existing.has(id)) {
    id = `${prefix}-${Date.now()}`;
  }
  return id;
}

// ---- Mentors ----

function getMentors() {
  return mentors;
}

/** Append a mentor and persist. Rolls back the in-memory push on write failure. */
async function addMentor(mentor) {
  mentors.push(mentor);
  try {
    await persist(MENTORS_FILE, mentors);
  } catch (err) {
    mentors.pop();
    throw err;
  }
  return mentor;
}

// ---- Personas (read-only demo data) ----

function getPersonas() {
  return personas;
}

// ---- Juniors (created signups) ----

function getJuniors() {
  return juniors;
}

/** Append a junior and persist. Rolls back the in-memory push on write failure. */
async function addJunior(junior) {
  juniors.push(junior);
  try {
    await persist(JUNIORS_FILE, juniors);
  } catch (err) {
    juniors.pop();
    throw err;
  }
  return junior;
}

// Load immediately so `require('./data/store')` is ready to use.
init();

module.exports = {
  init,
  nextId,
  getMentors,
  addMentor,
  getPersonas,
  getJuniors,
  addJunior,
};
