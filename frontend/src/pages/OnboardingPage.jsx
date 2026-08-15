import { useEffect, useState } from 'react';
import { fetchPersonas } from '../services/api';

const AVAILABILITY_OPTIONS = [
  { value: 'weekday-morning', label: 'Weekday mornings' },
  { value: 'weekday-evening', label: 'Weekday evenings' },
  { value: 'weekend', label: 'Weekends' },
];

const GOAL_MAX = 500;

// Level badge background per the onboarding scale: red / orange / green.
function levelColor(level) {
  if (level <= 1) return '#ef4444';
  if (level <= 3) return '#f97316';
  return '#4ade80';
}

function normalizeSkillName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-');
}

export default function OnboardingPage({ onSubmit }) {
  const [name, setName] = useState('');
  const [projectGoal, setProjectGoal] = useState('');
  const [availability, setAvailability] = useState([]);
  const [skills, setSkills] = useState({});
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState(1);
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    fetchPersonas()
      .then(setPersonas)
      .catch(() => setPersonas([]));
  }, []);

  function applyPersona(p) {
    setName(p.name || '');
    setProjectGoal(p.projectGoal || '');
    setAvailability(Array.isArray(p.availability) ? [...p.availability] : []);
    setSkills({ ...(p.currentSkills || {}) });
    setSelectedPersona(p.id);
  }

  function toggleAvailability(value) {
    setAvailability((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function setSkillLevel(skill, level) {
    setSkills((prev) => ({ ...prev, [skill]: level }));
  }

  function removeSkill(skill) {
    setSkills((prev) => {
      const next = { ...prev };
      delete next[skill];
      return next;
    });
  }

  function addSkill() {
    const clean = normalizeSkillName(newSkillName);
    if (!clean || Object.prototype.hasOwnProperty.call(skills, clean)) return;
    setSkills((prev) => ({ ...prev, [clean]: Number(newSkillLevel) }));
    setNewSkillName('');
    setNewSkillLevel(1);
  }

  function handleAddSkillKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSkill();
    }
  }

  const isValid = name.trim() && projectGoal.trim() && availability.length > 0;

  function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!isValid) return;
    onSubmit({
      name: name.trim(),
      currentSkills: skills,
      projectGoal: projectGoal.trim(),
      availability,
    });
  }

  return (
    <form className="container" onSubmit={handleSubmit}>
      {/* Section 1 — Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="header-title">Find Your Mentor</h1>
        <p className="header-subtitle">Tell us about yourself and what you're building</p>
      </div>

      {/* Section 2 — Demo personas */}
      <div className="card">
        <label className="field-label">Try a demo persona</label>
        <div className="persona-buttons">
          {personas.length === 0 && (
            <span className="field-hint">Loading demo personas…</span>
          )}
          {personas.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`persona-btn ${selectedPersona === p.id ? 'active' : ''}`}
              onClick={() => applyPersona(p)}
            >
              {p.name}
              <small>{p.projectGoal}</small>
            </button>
          ))}
        </div>
      </div>

      {/* Section 3 — Name */}
      <div className="card">
        <label className="field-label" htmlFor="name">Your name</label>
        <input
          id="name"
          className="text-input"
          type="text"
          placeholder="e.g. Alex Chen"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {/* Section 4 — Project goal */}
      <div className="card">
        <label className="field-label" htmlFor="goal">Project goal</label>
        <textarea
          id="goal"
          className="textarea"
          rows={4}
          maxLength={GOAL_MAX}
          placeholder="Describe what you're building. E.g.: I want to build a movie discovery app using Flutter for mobile with a Spring Boot REST API backend."
          value={projectGoal}
          onChange={(e) => setProjectGoal(e.target.value)}
          required
        />
        <div className="char-count">{projectGoal.length}/{GOAL_MAX}</div>
      </div>

      {/* Section 5 — Current skills */}
      <div className="card">
        <label className="field-label">
          What skills do you already have? <span className="field-hint">(Rate 0–5)</span>
        </label>

        <div className="skill-list">
          {Object.keys(skills).length === 0 && (
            <span className="field-hint">No skills added yet. Add some below.</span>
          )}
          {Object.entries(skills).map(([skill, level]) => (
            <div className="skill-row" key={skill}>
              <span className="skill-name">{skill.replace(/-/g, ' ')}</span>
              <input
                className="slider"
                type="range"
                min={0}
                max={5}
                step={1}
                value={level}
                aria-label={`${skill} skill level: ${level} out of 5`}
                onChange={(e) => setSkillLevel(skill, Number(e.target.value))}
              />
              <span className="level-badge" style={{ background: levelColor(level) }}>
                {level}
              </span>
              <button
                type="button"
                className="remove-btn"
                aria-label={`Remove ${skill}`}
                onClick={() => removeSkill(skill)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="add-skill-row">
          <input
            className="text-input"
            type="text"
            placeholder="e.g. react, python, sql"
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            onKeyDown={handleAddSkillKeyDown}
            aria-label="New skill name"
          />
          <select
            className="level-select"
            value={newSkillLevel}
            onChange={(e) => setNewSkillLevel(Number(e.target.value))}
            aria-label="New skill level"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={addSkill}>
            Add
          </button>
        </div>
      </div>

      {/* Section 6 — Availability */}
      <div className="card">
        <label className="field-label">When are you usually available?</label>
        <div className="availability-options">
          {AVAILABILITY_OPTIONS.map((opt) => (
            <label className="checkbox-option" key={opt.value}>
              <input
                type="checkbox"
                checked={availability.includes(opt.value)}
                onChange={() => toggleAvailability(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Section 7 — Submit */}
      <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={!isValid}>
        Find My Mentors →
      </button>

      {/* How it works */}
      <div className="how-it-works">
        <button
          type="button"
          className="how-toggle"
          aria-expanded={howOpen}
          onClick={() => setHowOpen((v) => !v)}
        >
          How does the matching work? {howOpen ? '▴' : '▾'}
        </button>
        {howOpen && (
          <ol className="how-steps">
            <li className="how-step">
              <span className="step-num">1</span>
              Your project goal is parsed by AI to extract required skills
            </li>
            <li className="how-step">
              <span className="step-num">2</span>
              We compute your skill gaps: the difference between where you are and where your project needs you to be
            </li>
            <li className="how-step">
              <span className="step-num">3</span>
              Mentors are ranked by how well they cover your specific gaps — not just their overall skill level
            </li>
          </ol>
        )}
      </div>
    </form>
  );
}
