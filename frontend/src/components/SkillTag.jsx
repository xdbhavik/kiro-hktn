/**
 * SkillTag — a small pill showing a skill name, a colored level dot, and
 * (optionally) the required level. Reused in the parsed-goal summary and
 * anywhere a compact skill chip is needed.
 *
 * Props:
 *  - skill    : string (hyphenated skill name)
 *  - level    : number (1-5) — optional; when present shows "→ Level n" + dot color
 *  - variant  : "target" | "gap" | "covered" | "neutral" (controls border color)
 *  - showLevel: boolean — render the "→ Level n" text (default true when level set)
 */

const VARIANT_CLASS = {
  target: 'tag-target',
  gap: 'tag-gap',
  covered: 'tag-covered',
  neutral: 'tag-neutral',
};

// Dot color by required level: green (low), yellow (mid), orange (high).
function dotColorForLevel(level) {
  if (level >= 4) return '#f97316';
  if (level === 3) return '#eab308';
  return '#4ade80';
}

const VARIANT_DOT = {
  target: '#7c6af7',
  gap: '#f97316',
  covered: '#4ade80',
  neutral: '#8888a4',
};

function prettify(skill) {
  return String(skill).replace(/-/g, ' ');
}

export default function SkillTag({ skill, level, variant = 'target', showLevel = true }) {
  const hasLevel = typeof level === 'number';
  const dotColor = hasLevel ? dotColorForLevel(level) : VARIANT_DOT[variant];
  const title = hasLevel ? `Required level: ${level}/5` : undefined;

  return (
    <span
      className={`skill-tag ${VARIANT_CLASS[variant] || 'tag-neutral'}`}
      title={title}
      style={{ textTransform: 'capitalize' }}
    >
      <span className="tag-dot" style={{ background: dotColor }} aria-hidden="true" />
      {prettify(skill)}
      {hasLevel && showLevel ? ` \u2192 Level ${level}` : ''}
    </span>
  );
}
