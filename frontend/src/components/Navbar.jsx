import { useState } from "react";
import { Link } from "react-router-dom";
import "./navbar.css";

const STORAGE_KEY = "bf_dev_logged_in";

function Navbar() {
  const [loggedIn, setLoggedIn] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );

  function setState(value) {
    localStorage.setItem(STORAGE_KEY, String(value));
    setLoggedIn(value);
  }

  return (
    <header className="nav">
      <Link to="/" className="nav-logo">BiletFlow</Link>
      <nav className="nav-links" aria-label="Main">
        <Link to="/events">Events</Link>
        {loggedIn ? (
          <>
            <Link to="/organizer/dashboard">For organizers</Link>
            <Link to="/my-tickets">My tickets</Link>
            <button type="button" className="nav-btn" onClick={() => setState(false)}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/signup">For organizers</Link>
            <Link to="/login">Log in</Link>
            <Link to="/signup" className="nav-btn">Sign up</Link>
          </>
        )}
        {/* TODO: remove this dev switch when real login exists */}
        <button type="button" className="nav-dev" onClick={() => setState(!loggedIn)}>
          Dev: {loggedIn ? "logged in" : "logged out"}
        </button>
      </nav>
    </header>
  );
}

export default Navbar;