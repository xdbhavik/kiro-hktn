import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SkillTag from '../components/SkillTag';

const SLOT_LABELS = {
  'weekday-morning': 'Weekday mornings',
  'weekday-evening': 'Weekday evenings',
  weekend: 'Weekends',
};

// Avatar / match-badge color by match strength.
function matchColor(pct) {
  if (pct > 80) return '#4ade80';
  if (pct >= 60) return '#f97316';
  return '#ef4444';
}

function prettifySkill(skill) {
  return String(skill).replace(/-/g, ' ');
}

function truncate(text, max) {
  const t = String(text || '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Renders the 5-square gap bar for a single reason. */
function GapBar({ juniorLevel, targetLevel, mentorLevel }) {
  const squares = [];
  for (let i = 0; i < 5; i += 1) {
    let cls = 'gap-square';
    if (i < juniorLevel) cls += ' have';
    else if (i < targetLevel) cls += ' gap';
    else if (i < mentorLevel) cls += ' mentor';
    squares.push(<span key={i} className={cls} />);
  }
  return <div className="gap-bar" aria-hidden="true">{squares}</div>;
}

function MatchCard({ match, juniorAvailability, rank }) {
  const [requested, setRequested] = useState(false);
  const { mentor, matchPercent, reasons } = match;
  const color = matchColor(matchPercent);
  const juniorSlots = new Set(juniorAvailability || []);
  const loadPct = mentor.maxMentees
    ? Math.round((mentor.currentMentees / mentor.maxMentees) * 100)
    : 0;

  return (
    <div
      className={`match-card ${rank === 1 ? 'rank-1' : ''}`}
      style={{ animationDelay: `${(rank - 1) * 0.1}s` }}
    >
      {/* A — header */}
      <div className="match-header">
        <div className="avatar" style={{ background: color }}>
          {mentor.avatarInitials}
        </div>
        <div className="match-header-info">
          <div className="mentor-name">{mentor.name}</div>
          <div className="mentor-title">{mentor.title}</div>
        </div>
        <div className="match-badge">
          <div className="pct" style={{ color }}>{matchPercent}</div>
          <div className="lbl">% match</div>
        </div>
      </div>

      {/* B — bio */}
      <p className="mentor-bio">{mentor.bio}</p>

      {/* C — why this match */}
      <div className="why-section">
        <div className="why-label">
          <span className="sparkle">✦</span> Why this match
        </div>
        {reasons.map((r) => (
          <div className="reason-row" key={r.skill}>
            <div className="reason-skill">{prettifySkill(r.skill)}</div>
            <GapBar
              juniorLevel={r.juniorLevel}
              targetLevel={r.targetLevel}
              mentorLevel={r.mentorLevel}
            />
            <div className="gap-legend">
              You: {r.juniorLevel} → Needed: {r.targetLevel} → Mentor: {r.mentorLevel}/5
            </div>
          </div>
        ))}
      </div>

      {/* D — availability overlap */}
      <div className="avail-row">
        {mentor.availability.map((slot) => {
          const isMatch = juniorSlots.has(slot);
          return (
            <span key={slot} className={`avail-slot ${isMatch ? 'match' : 'no'}`}>
              {SLOT_LABELS[slot] || slot} {isMatch ? '✓' : '•'}
            </span>
          );
        })}
      </div>

      {/* E — capacity */}
      <div className="capacity-row">
        Mentoring {mentor.currentMentees}/{mentor.maxMentees} juniors
        <div className="capacity-bar">
          <div className="capacity-fill" style={{ width: `${loadPct}%` }} />
        </div>
      </div>

      {/* F — request */}
      {requested ? (
        <div className="request-sent">
          Mentorship request sent to {mentor.name}! (Demo mode)
        </div>
      ) : (
        <button
          type="button"
          className="btn-outline request-btn"
          onClick={() => setRequested(true)}
        >
          Request Mentorship
        </button>
      )}
    </div>
  );
}

export default function ResultsPage({ matchResults, juniorProfile, onStartOver }) {
  const navigate = useNavigate();

  // If the user lands here without results (e.g. refresh), go back to the form.
  useEffect(() => {
    if (!matchResults) navigate('/');
  }, [matchResults, navigate]);

  if (!matchResults) return null;

  const { parsedGoal, matches } = matchResults;
  const targetSkills = (parsedGoal && parsedGoal.targetSkills) || {};

  return (
    <div className="container-wide">
      {/* Header bar */}
      <div className="results-header">
        <button type="button" className="btn-ghost" onClick={onStartOver}>
          ← Start Over
        </button>
        <h1 className="results-title">Your Mentor Matches</h1>
        <div className="results-meta">
          <strong>{juniorProfile?.name}</strong>
          for: {truncate(juniorProfile?.projectGoal, 60)}
        </div>
      </div>

      {/* Demo banner */}
      <div className="demo-banner">
        🎯 Demo Mode — Mentors are seeded profiles. In production, real mentors would
        onboard through a separate portal.
      </div>

      {/* Parsed goal summary */}
      <div className="parsed-card">
        <div className="parsed-label">
          AI detected these required skills from your project goal:
        </div>
        <span className="domain-badge">Domain: {parsedGoal?.domain}</span>
        <div className="parsed-tags">
          {Object.entries(targetSkills).map(([skill, level]) => (
            <SkillTag key={skill} skill={skill} level={level} variant="target" />
          ))}
        </div>
        <div className="parsed-caption">
          Match % = how well each mentor covers your specific skill gaps
        </div>
      </div>

      {/* Matches or empty state */}
      {matches.length === 0 ? (
        <div className="no-match">
          <div className="icon">🔍</div>
          <h2>No strong matches found</h2>
          <p>
            Try adjusting your skills — if you already have most required skills, the gap
            may be too small to match.
          </p>
          <button type="button" className="btn-ghost" onClick={onStartOver}>
            ← Go Back
          </button>
        </div>
      ) : (
        matches.map((match, idx) => (
          <MatchCard
            key={match.mentor.id}
            match={match}
            juniorAvailability={juniorProfile?.availability}
            rank={idx + 1}
          />
        ))
      )}
    </div>
  );
}
