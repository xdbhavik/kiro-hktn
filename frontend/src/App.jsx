import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import OnboardingPage from './pages/OnboardingPage';
import ResultsPage from './pages/ResultsPage';
import Navbar from './components/Navbar';
import { submitProfile, saveJunior } from './services/api';
import './App.css';

function LoadingScreen() {
  return (
    <div className="screen">
      <div className="pulse-circle" />
      <h2 className="screen-title">Finding your best mentors...</h2>
      <p className="screen-sub">Analyzing skill gaps and ranking matches</p>
    </div>
  );
}

function ErrorScreen({ error, onRetry }) {
  return (
    <div className="screen">
      <div className="screen-icon error">⚠️</div>
      <h2 className="screen-title">Something went wrong</h2>
      <p className="screen-sub">{error}</p>
      <button className="btn-primary" onClick={onRetry}>
        Try Again
      </button>
    </div>
  );
}

/**
 * Inner component so it can use useNavigate (must live inside BrowserRouter).
 * Holds all app-level state and renders loading / error / routes.
 */
function AppRoutes() {
  const navigate = useNavigate();
  const [juniorProfile, setJuniorProfile] = useState(null);
  const [matchResults, setMatchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showMentorNav, setShowMentorNav] = useState(false);

  async function handleSubmit(profile) {
    setLoading(true);
    setError(null);
    try {
      // Persist the junior profile (real onboarding). Non-blocking: a save
      // failure must not prevent the user from seeing their matches.
      saveJunior(profile).catch(() => {});

      const result = await submitProfile(profile);
      setMatchResults(result);
      setJuniorProfile(profile);
      setShowMentorNav(true);
      navigate('/results');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleStartOver() {
    setJuniorProfile(null);
    setMatchResults(null);
    setError(null);
    setShowMentorNav(false);
    navigate('/');
  }

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} onRetry={handleStartOver} />;

  return (
    <>
      <Navbar showBadge={showMentorNav} />
      <Routes>
        <Route path="/" element={<OnboardingPage onSubmit={handleSubmit} />} />
        <Route
          path="/results"
          element={
            <ResultsPage
              matchResults={matchResults}
              juniorProfile={juniorProfile}
              onStartOver={handleStartOver}
            />
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
