/**
 * goalParser.js — turns a junior's free-text project goal into a structured
 * { targetSkills, domain } object.
 *
 * The real parser calls a FREE-TIER LLM (Groq or OpenRouter) via an
 * OpenAI-compatible /chat/completions endpoint. If anything goes wrong
 * (missing key, network error, bad JSON) it silently falls back to a
 * deterministic keyword-based mock so the app never crashes.
 *
 * NOTE: We do NOT use Claude/Anthropic. Provider is selected via env vars.
 */

'use strict';

// The controlled skill vocabulary. Mentors are scored ONLY on these skills, so
// the parser must map every extracted skill onto one of them — otherwise the
// target skill can never be covered and match percentages are diluted.
const SKILL_VOCABULARY = [
  // Frontend
  'react', 'vue', 'angular', 'svelte', 'next-js', 'redux', 'typescript',
  'javascript', 'css', 'tailwind', 'html',
  // Backend / web frameworks
  'node', 'express', 'nestjs', 'fastapi', 'flask', 'django', 'spring-boot',
  'laravel', 'ruby-on-rails', 'asp-net', 'graphql', 'rest-api', 'grpc',
  // Languages
  'python', 'java', 'c-sharp', 'cpp', 'c', 'rust', 'go', 'kotlin', 'swift',
  'ruby', 'php', 'scala', 'elixir', 'haskell', 'lua', 'r', 'perl', 'objective-c',
  // Mobile
  'flutter', 'dart', 'react-native', 'android', 'ios', 'swiftui', 'jetpack-compose',
  // Game development
  'unity', 'unreal-engine', 'godot', 'game-design', 'opengl', 'vulkan', 'directx', 'blender',
  // Operating systems / systems programming
  'operating-systems', 'linux', 'systems-programming', 'kernel-development',
  'embedded-systems', 'assembly', 'distributed-systems', 'concurrency', 'compilers',
  // Data / ML
  'machine-learning', 'deep-learning', 'pytorch', 'tensorflow', 'data-science',
  'nlp', 'computer-vision', 'pandas', 'spark',
  // Cloud / DevOps
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
  'ci-cd', 'jenkins', 'git', 'prometheus',
  // Databases
  'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite', 'cassandra',
  'dynamodb', 'elasticsearch', 'kafka',
  // Security
  'cybersecurity', 'penetration-testing', 'cryptography', 'network-security',
  // Blockchain
  'solidity', 'blockchain', 'web3',
];

const SYSTEM_PROMPT = `You are a skill extraction engine. Given a junior developer's project goal, extract the technical skills required and the project domain.

Respond ONLY with a valid JSON object. No explanation, no markdown, no backticks.
Format:
{
  "targetSkills": {
    "skill-name": requiredLevel
  },
  "domain": "string"
}

You MUST only use skill names from this exact allowed list:
${SKILL_VOCABULARY.join(', ')}

Map every concept in the goal onto the closest skill from that list. Examples:
- "vue.js" or "vuejs" -> "vue"
- "state management" -> "redux"
- "websockets" or "realtime" or "socket.io" -> "node"
- "REST" or "API" -> "rest-api"
- "postgres" -> "postgresql"
- "ML" or "AI model" or "neural network" -> "machine-learning"
- "C#" -> "c-sharp"
- "C++" -> "cpp"
- "nextjs" or "next.js" -> "next-js"
- "golang" -> "go"
- "operating system" or "OS" or "os architecture" -> "operating-systems"
- "kernel" -> "kernel-development"
- "unreal" or "unreal engine" -> "unreal-engine"
- "react native" -> "react-native"
- ".NET" or "dotnet" -> "asp-net"
- "rails" -> "ruby-on-rails"
- "k8s" -> "kubernetes"
- "pentesting" -> "penetration-testing"
- "embedded" or "firmware" -> "embedded-systems"
If a concept has no reasonable match in the list, omit it. Never invent skills outside the list.

Required levels use this scale: 1=beginner, 2=intermediate, 3=working knowledge, 4=advanced.
Domain must be one of: frontend, backend, fullstack, mobile, devops, ml, data, game-dev, systems, security, blockchain, other.
Extract only the skills that are central to building the described project. Maximum 6 skills.`;

/**
 * Resolve which provider to use. Explicit LLM_PROVIDER wins; otherwise infer
 * from whichever API key is present. Defaults to groq.
 */
function resolveProviderConfig() {
  const explicit = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  const provider =
    explicit ||
    (process.env.GROQ_API_KEY ? 'groq' : process.env.OPENROUTER_API_KEY ? 'openrouter' : 'groq');

  const configs = {
    groq: {
      provider: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
    },
    openrouter: {
      provider: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.LLM_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    },
  };

  return configs[provider] || configs.groq;
}

/**
 * Strip stray markdown code fences a model might wrap JSON in, then JSON.parse.
 */
function parseJsonLoosely(text) {
  let cleaned = String(text).trim();
  if (cleaned.startsWith('```')) {
    // remove leading ```json / ``` and trailing ```
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  }
  // If there's leading/trailing prose, grab the outermost JSON object.
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }
  return JSON.parse(cleaned);
}

/**
 * PART A — Real LLM parser. Throws on any failure so parseGoal can fall back.
 * @param {string} projectGoalText
 * @returns {Promise<{ targetSkills: Object, domain: string }>}
 */
async function parseWithLLM(projectGoalText) {
  const cfg = resolveProviderConfig();

  if (!cfg.key) {
    throw new Error(`No API key set for provider "${cfg.provider}"`);
  }

  const headers = {
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
  };
  // OpenRouter recommends (but does not require) these attribution headers.
  if (cfg.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:3000';
    headers['X-Title'] = 'Peer Mentor Matcher';
  }

  const body = {
    model: cfg.model,
    max_tokens: 500,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: projectGoalText },
    ],
  };

  // Guard against a slow/hung provider so a request never blocks for long.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`LLM HTTP ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  // OpenAI-compatible shape: choices[0].message.content (NOT Anthropic's content[0].text).
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    throw new Error('LLM response missing choices[0].message.content');
  }

  const parsed = parseJsonLoosely(content);
  if (!parsed || typeof parsed !== 'object' || !parsed.targetSkills) {
    throw new Error('LLM returned JSON without targetSkills');
  }

  // Safety net: keep only skills that exist in the controlled vocabulary, so a
  // stray model output can never dilute or break matching.
  const allowed = new Set(SKILL_VOCABULARY);
  const targetSkills = {};
  for (const [skill, level] of Object.entries(parsed.targetSkills)) {
    const key = String(skill).toLowerCase().trim();
    if (allowed.has(key)) {
      const lvl = Math.max(1, Math.min(5, Math.round(Number(level) || 0)));
      targetSkills[key] = lvl;
    }
  }
  if (Object.keys(targetSkills).length === 0) {
    throw new Error('LLM returned no skills within the allowed vocabulary');
  }

  return { targetSkills, domain: parsed.domain || 'other' };
}

/**
 * PART B — Deterministic mock fallback. Case-insensitive keyword matching.
 * Conditions are checked in order; the first match wins.
 * @param {string} projectGoalText
 * @returns {{ targetSkills: Object, domain: string }}
 */
function parseWithMock(projectGoalText) {
  const goal = String(projectGoalText || '').toLowerCase();
  const has = (...keywords) => keywords.some((k) => goal.includes(k));

  if (has('react', 'dashboard', 'typescript')) {
    return { targetSkills: { react: 3, typescript: 3, redux: 2, css: 2 }, domain: 'frontend' };
  }
  if (has('flask', 'django', 'python', 'task management')) {
    return { targetSkills: { python: 3, flask: 3, 'rest-api': 3, postgresql: 2 }, domain: 'backend' };
  }
  if (has('next', 'nextjs', 'next.js', 'e-commerce', 'ecommerce')) {
    return { targetSkills: { 'next-js': 3, node: 3, express: 2, mongodb: 2 }, domain: 'fullstack' };
  }
  if (has('flutter', 'mobile', 'android', 'ios')) {
    return { targetSkills: { flutter: 3, 'rest-api': 2 }, domain: 'mobile' };
  }
  if (has('spring', 'java', 'microservice')) {
    return { targetSkills: { java: 3, 'spring-boot': 3, 'rest-api': 3, sql: 2 }, domain: 'backend' };
  }
  if (has('machine learning', 'ml', 'ai model', 'neural', 'deep learning', 'computer vision', 'nlp')) {
    return { targetSkills: { python: 3, 'machine-learning': 4, 'deep-learning': 3, pytorch: 2 }, domain: 'ml' };
  }
  if (has('unreal')) {
    return { targetSkills: { 'unreal-engine': 4, cpp: 3, 'game-design': 2 }, domain: 'game-dev' };
  }
  if (has('godot')) {
    return { targetSkills: { godot: 4, 'game-design': 3 }, domain: 'game-dev' };
  }
  if (has('game', 'unity', 'gamedev')) {
    return { targetSkills: { unity: 3, 'c-sharp': 3, 'game-design': 2 }, domain: 'game-dev' };
  }
  if (has('operating system', 'os architecture', 'kernel', 'systems programming', 'compiler', 'embedded', 'firmware', 'assembly')) {
    return { targetSkills: { 'operating-systems': 4, c: 3, 'systems-programming': 3, linux: 2 }, domain: 'systems' };
  }
  if (has('rust')) {
    return { targetSkills: { rust: 4, 'systems-programming': 3, concurrency: 2 }, domain: 'systems' };
  }
  if (has('golang', 'go microservice', 'go backend')) {
    return { targetSkills: { go: 4, 'rest-api': 3, docker: 2 }, domain: 'backend' };
  }
  if (has('c++', 'cpp')) {
    return { targetSkills: { cpp: 4, 'systems-programming': 3 }, domain: 'systems' };
  }
  if (has('security', 'cyber', 'pentest', 'penetration')) {
    return { targetSkills: { cybersecurity: 4, 'penetration-testing': 3, 'network-security': 2, linux: 2 }, domain: 'security' };
  }
  if (has('blockchain', 'solidity', 'web3', 'smart contract')) {
    return { targetSkills: { solidity: 4, blockchain: 3, web3: 3 }, domain: 'blockchain' };
  }
  if (has('data pipeline', 'data engineering', 'kafka', 'spark')) {
    return { targetSkills: { python: 3, spark: 3, kafka: 3, sql: 2 }, domain: 'data' };
  }
  // Default fallback.
  return { targetSkills: { node: 2, express: 2, 'rest-api': 2 }, domain: 'backend' };
}

/**
 * PART C — Public entry point. Never rejects.
 * @param {string} projectGoalText
 * @returns {Promise<{ targetSkills: Object, domain: string }>}
 */
async function parseGoal(projectGoalText) {
  try {
    const result = await parseWithLLM(projectGoalText);
    if (result && result.targetSkills && Object.keys(result.targetSkills).length > 0) {
      return result;
    }
    throw new Error('Empty or invalid LLM result');
  } catch (err) {
    console.log('LLM parser failed, using mock fallback:', err.message);
    return parseWithMock(projectGoalText);
  }
}

module.exports = { parseGoal, parseWithMock, parseWithLLM, SKILL_VOCABULARY };
