/**
 * generateMentors.js — seed generator for a large, diverse mentor pool.
 *
 * Rebuilds mentors.json = the original 10 hand-authored seed mentors (m1-m10)
 * + 100 generated mentors (m11-m110) spanning many technology areas:
 * frontend, backend, full-stack, mobile, DevOps/cloud, ML/data, game dev,
 * OS / systems architecture, language specialists, security, and blockchain.
 *
 * All skills are drawn from the controlled SKILL_VOCABULARY in goalParser.js,
 * so every generated mentor is actually matchable.
 *
 * Idempotent: it keeps only the seed mentors (m1-m10) from the existing file
 * and regenerates the rest, so re-running produces the same 110-mentor set.
 *
 * Usage:  node backend/data/generateMentors.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { SKILL_VOCABULARY } = require('../engine/goalParser');

const MENTORS_FILE = path.join(__dirname, 'mentors.json');
const VOCAB = new Set(SKILL_VOCABULARY);

// Deterministic PRNG (mulberry32) so the generated pool is stable across runs.
function mulberry32(seed) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260815);

const rand = (n) => Math.floor(rng() * n);
const pick = (arr) => arr[rand(arr.length)];
const randInt = (min, max) => min + rand(max - min + 1);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FIRST_NAMES = [
  'Aarav', 'Bianca', 'Chen', 'Diana', 'Ethan', 'Fatima', 'Gabriel', 'Hana',
  'Ibrahim', 'Julia', 'Kenji', 'Lena', 'Mateo', 'Nadia', 'Omar', 'Priya',
  'Quinn', 'Rosa', 'Sven', 'Tara', 'Umar', 'Vera', 'Wei', 'Xander', 'Yara',
  'Zoe', 'Arjun', 'Beatriz', 'Caleb', 'Dmitri', 'Elif', 'Finn', 'Grace',
  'Hugo', 'Ines', 'Jonas', 'Keira', 'Liam', 'Maya', 'Noah', 'Olga', 'Pedro',
  'Ravi', 'Sofia', 'Theo', 'Uma', 'Viktor', 'Willa', 'Yusuf', 'Zainab',
];

const LAST_NAMES = [
  'Anand', 'Brooks', 'Castro', 'Devlin', 'Eriksson', 'Fontaine', 'Gupta',
  'Haddad', 'Ivanov', 'Jensen', 'Kowalski', 'Lindqvist', 'Mercado', 'Nakamura',
  'Owusu', 'Petrov', 'Quintero', 'Reyes', 'Silva', 'Tanaka', 'Ueda', 'Vargas',
  'Wong', 'Xu', 'Yilmaz', 'Zhang', 'Abbas', 'Bauer', 'Cohen', 'Dubois',
  'Farah', 'Greco', 'Holm', 'Iqbal', 'Johansson', 'Khan', 'Lopez', 'Moreau',
  'Novak', 'Ortiz', 'Popescu', 'Rahman', 'Sato', 'Torres', 'Ustinov',
];

const ALL_SLOTS = ['weekday-morning', 'weekday-evening', 'weekend'];

/**
 * Archetypes define a technology niche. `core` skills are the mentor's
 * strengths (levels 4-5); `support` skills round out the profile (levels 2-4).
 */
const ARCHETYPES = {
  frontend: {
    titles: ['Frontend Engineer', 'Senior Frontend Engineer', 'UI Engineer', 'Web Frontend Developer'],
    domains: ['frontend'],
    bio: (t) => `Builds fast, accessible web interfaces with ${t}.`,
    core: ['react', 'vue', 'angular', 'svelte', 'typescript', 'javascript', 'next-js', 'redux'],
    support: ['css', 'tailwind', 'html', 'graphql', 'rest-api'],
  },
  backend: {
    titles: ['Backend Engineer', 'Senior Backend Engineer', 'API Engineer', 'Backend Developer'],
    domains: ['backend'],
    bio: (t) => `Designs reliable server-side systems and APIs with ${t}.`,
    core: ['node', 'express', 'nestjs', 'fastapi', 'flask', 'django', 'spring-boot', 'laravel', 'ruby-on-rails', 'asp-net'],
    support: ['rest-api', 'graphql', 'grpc', 'sql', 'postgresql', 'redis', 'docker'],
  },
  fullstack: {
    titles: ['Full-Stack Engineer', 'Senior Full-Stack Engineer', 'Full-Stack Developer'],
    domains: ['fullstack', 'frontend', 'backend'],
    bio: (t) => `Ships features end to end across the stack, anchored in ${t}.`,
    core: ['react', 'next-js', 'node', 'express', 'typescript'],
    support: ['mongodb', 'postgresql', 'graphql', 'rest-api', 'docker', 'tailwind'],
  },
  mobile: {
    titles: ['Mobile Engineer', 'Android Engineer', 'iOS Engineer', 'Cross-Platform Mobile Developer'],
    domains: ['mobile'],
    bio: (t) => `Delivers polished mobile apps built with ${t}.`,
    core: ['flutter', 'react-native', 'android', 'ios', 'swiftui', 'jetpack-compose', 'kotlin', 'swift'],
    support: ['dart', 'rest-api', 'graphql', 'sqlite'],
  },
  devops: {
    titles: ['DevOps Engineer', 'Cloud Engineer', 'Platform Engineer', 'Site Reliability Engineer'],
    domains: ['devops'],
    bio: (t) => `Automates infrastructure and delivery pipelines with ${t}.`,
    core: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible'],
    support: ['ci-cd', 'jenkins', 'git', 'prometheus', 'linux', 'postgresql'],
  },
  ml: {
    titles: ['Machine Learning Engineer', 'ML Researcher', 'AI Engineer', 'Data Scientist'],
    domains: ['ml', 'data'],
    bio: (t) => `Trains and ships models spanning ${t}.`,
    core: ['machine-learning', 'deep-learning', 'pytorch', 'tensorflow', 'nlp', 'computer-vision'],
    support: ['python', 'data-science', 'pandas', 'sql', 'spark'],
  },
  data: {
    titles: ['Data Engineer', 'Analytics Engineer', 'Big Data Engineer'],
    domains: ['data', 'backend'],
    bio: (t) => `Builds data pipelines and warehouses powered by ${t}.`,
    core: ['spark', 'kafka', 'pandas', 'data-science', 'sql'],
    support: ['python', 'postgresql', 'elasticsearch', 'cassandra', 'aws'],
  },
  game: {
    titles: ['Game Developer', 'Gameplay Engineer', 'Game Engine Programmer', 'Technical Game Designer'],
    domains: ['game-dev'],
    bio: (t) => `Builds interactive games and engines with ${t}.`,
    core: ['unity', 'unreal-engine', 'godot', 'c-sharp', 'cpp'],
    support: ['game-design', 'opengl', 'vulkan', 'directx', 'blender', 'lua', 'c'],
  },
  systems: {
    titles: ['Systems Engineer', 'OS Engineer', 'Kernel Developer', 'Systems Architect', 'Embedded Systems Engineer'],
    domains: ['systems'],
    bio: (t) => `Works close to the metal on ${t}.`,
    core: ['operating-systems', 'kernel-development', 'systems-programming', 'c', 'rust', 'assembly'],
    support: ['linux', 'concurrency', 'distributed-systems', 'compilers', 'embedded-systems', 'cpp'],
  },
  security: {
    titles: ['Security Engineer', 'Penetration Tester', 'Application Security Engineer', 'Security Researcher'],
    domains: ['security'],
    bio: (t) => `Hardens systems and hunts vulnerabilities using ${t}.`,
    core: ['cybersecurity', 'penetration-testing', 'cryptography', 'network-security'],
    support: ['linux', 'python', 'c', 'docker'],
  },
  blockchain: {
    titles: ['Blockchain Engineer', 'Smart Contract Developer', 'Web3 Engineer'],
    domains: ['blockchain'],
    bio: (t) => `Builds decentralized apps and smart contracts with ${t}.`,
    core: ['solidity', 'blockchain', 'web3'],
    support: ['rust', 'go', 'node', 'rest-api'],
  },
};

// Language-specialist sub-archetypes: each centers on one language + ecosystem.
const LANGUAGE_SPECIALISTS = [
  { lang: 'rust', label: 'Rust', domains: ['systems', 'backend'], eco: ['systems-programming', 'concurrency', 'web3', 'rest-api'] },
  { lang: 'go', label: 'Go', domains: ['backend', 'devops'], eco: ['rest-api', 'grpc', 'docker', 'kubernetes'] },
  { lang: 'cpp', label: 'C++', domains: ['systems', 'game-dev'], eco: ['systems-programming', 'opengl', 'concurrency', 'unreal-engine'] },
  { lang: 'java', label: 'Java', domains: ['backend'], eco: ['spring-boot', 'rest-api', 'sql', 'kafka'] },
  { lang: 'c-sharp', label: 'C#', domains: ['backend', 'game-dev'], eco: ['asp-net', 'unity', 'rest-api'] },
  { lang: 'kotlin', label: 'Kotlin', domains: ['mobile', 'backend'], eco: ['android', 'jetpack-compose', 'spring-boot'] },
  { lang: 'swift', label: 'Swift', domains: ['mobile'], eco: ['ios', 'swiftui'] },
  { lang: 'ruby', label: 'Ruby', domains: ['backend'], eco: ['ruby-on-rails', 'rest-api', 'postgresql'] },
  { lang: 'php', label: 'PHP', domains: ['backend'], eco: ['laravel', 'mysql', 'rest-api'] },
  { lang: 'scala', label: 'Scala', domains: ['data', 'backend'], eco: ['spark', 'kafka', 'sql'] },
  { lang: 'elixir', label: 'Elixir', domains: ['backend'], eco: ['rest-api', 'postgresql', 'concurrency'] },
  { lang: 'python', label: 'Python', domains: ['backend', 'data'], eco: ['django', 'fastapi', 'pandas', 'rest-api'] },
];

// How many mentors of each archetype (sums to 100). Game dev, OS/systems, and
// language specialists are emphasized per the request.
const DISTRIBUTION = [
  ['frontend', 10],
  ['backend', 10],
  ['fullstack', 8],
  ['mobile', 8],
  ['devops', 8],
  ['ml', 6],
  ['data', 2],
  ['game', 12],
  ['systems', 12],
  ['security', 4],
  ['blockchain', 2],
  ['language', 18],
];

function makeInitials(name) {
  const letters = name.replace(/[^A-Za-z]/g, '');
  return (letters.slice(0, 2) || 'NA').toUpperCase();
}

function uniqueSkills(list) {
  return [...new Set(list.filter((s) => VOCAB.has(s)))];
}

function buildSkillMap(corePool, supportPool) {
  const skills = {};
  const coreCount = randInt(2, Math.min(4, corePool.length));
  for (const s of shuffle(corePool).slice(0, coreCount)) {
    skills[s] = randInt(4, 5);
  }
  const supportCount = randInt(1, Math.min(3, supportPool.length));
  for (const s of shuffle(supportPool).slice(0, supportCount)) {
    if (!(s in skills)) skills[s] = randInt(2, 4);
  }
  return skills;
}

function randomAvailability() {
  const count = randInt(1, 3);
  return shuffle(ALL_SLOTS).slice(0, count).sort();
}

function generateMentor(archKey, index, langSpec) {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const maxMentees = randInt(3, 8);
  const currentMentees = randInt(0, maxMentees - 1);

  let title;
  let domains;
  let bio;
  let skills;

  if (archKey === 'language') {
    const spec = langSpec || pick(LANGUAGE_SPECIALISTS);
    title = `${spec.label} Developer`;
    domains = [...spec.domains];
    const core = uniqueSkills([spec.lang, ...spec.eco]);
    skills = buildSkillMap([spec.lang, spec.lang, ...spec.eco], spec.eco);
    skills[spec.lang] = 5; // the language they specialize in
    bio = `${spec.label} specialist focused on production-grade ${spec.label} systems.`;
    void core;
  } else {
    const a = ARCHETYPES[archKey];
    title = pick(a.titles);
    domains = [...a.domains];
    skills = buildSkillMap(a.core, a.support);
    const headline = Object.keys(skills)[0] || archKey;
    bio = a.bio(headline.replace(/-/g, ' '));
  }

  return {
    id: `m${11 + index}`,
    name,
    title,
    bio,
    skills,
    domains,
    availability: randomAvailability(),
    currentMentees,
    maxMentees,
    avatarInitials: makeInitials(name),
  };
}

function main() {
  // Keep only the original hand-authored seed mentors (m1-m10).
  let seed = [];
  try {
    const existing = JSON.parse(fs.readFileSync(MENTORS_FILE, 'utf-8'));
    seed = existing.filter((m) => /^m([1-9]|10)$/.test(m.id));
  } catch (err) {
    console.error('Could not read existing mentors.json:', err.message);
    process.exit(1);
  }
  if (seed.length !== 10) {
    console.warn(`Warning: expected 10 seed mentors, found ${seed.length}.`);
  }

  // Expand the distribution into a flat list of archetype keys.
  const plan = [];
  for (const [key, count] of DISTRIBUTION) {
    for (let i = 0; i < count; i += 1) plan.push(key);
  }

  // Round-robin over language specialists so every language (and its
  // ecosystem, e.g. php -> mysql) is guaranteed at least one mentor.
  let langCounter = 0;
  const generated = plan.map((key, i) => {
    if (key === 'language') {
      const spec = LANGUAGE_SPECIALISTS[langCounter % LANGUAGE_SPECIALISTS.length];
      langCounter += 1;
      return generateMentor(key, i, spec);
    }
    return generateMentor(key, i);
  });
  const all = [...seed, ...generated];

  fs.writeFileSync(MENTORS_FILE, JSON.stringify(all, null, 2) + '\n');
  console.log(`Wrote ${all.length} mentors (${seed.length} seed + ${generated.length} generated) to mentors.json`);

  // Coverage report: which vocabulary skills are represented.
  const covered = new Set();
  all.forEach((m) => Object.keys(m.skills).forEach((s) => covered.add(s)));
  const missing = SKILL_VOCABULARY.filter((s) => !covered.has(s));
  console.log(`Skill coverage: ${covered.size}/${SKILL_VOCABULARY.length} vocabulary skills present.`);
  if (missing.length) console.log('Not covered:', missing.join(', '));
}

main();
