import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import "./navbar.css";

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <header className="nav">
      <Link to="/" className="nav-logo">BiletFlow</Link>
      <nav className="nav-links" aria-label="Main">
        <Link to="/events">Events</Link>
        {user ? (
          <>
            {user.role === "organizer" && (
              <Link to="/organizer/dashboard">For organizers</Link>
            )}
            <Link to="/my-tickets">My tickets</Link>
            <button type="button" className="nav-btn" onClick={handleLogout}>
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
      </nav>
    </header>
  );
}

export default Navbar;