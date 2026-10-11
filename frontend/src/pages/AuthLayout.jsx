import { Link } from "react-router-dom";
import "./auth.css";

// Shared frame for the Sign up and Log in pages:
// a dark panel with the BiletFlow message on the left, the form on the right.
function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/" className="auth-logo">BiletFlow</Link>
        <div className="auth-side-text">
          <h2>Events across Kazakhstan, one ticket away.</h2>
          <ul>
            <li>Free events stay free</li>
            <li>QR-code tickets you can print</li>
            <li>Fast check-in at the door</li>
          </ul>
        </div>
        <span className="auth-side-foot">© 2026 BiletFlow</span>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <Link to="/" className="auth-back">← Back to home</Link>
          <h1>{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
