/**
 * Navbar — fixed top bar. Shows an "Powered by AI" badge on the results view.
 */
export default function Navbar({ showBadge }) {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <span className="logo-dot" aria-hidden="true" />
        <span>PeerMatch</span>
      </div>
      {showBadge && <span className="navbar-badge">Powered by AI</span>}
    </nav>
  );
}
