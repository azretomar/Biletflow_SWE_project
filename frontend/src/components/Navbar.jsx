import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { t } from "../i18n";
import LanguagePicker from "./LanguagePicker";
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
      <nav className="nav-links" aria-label={t("Main")}>
        <Link to="/events">{t("Events")}</Link>
        {user ? (
          <>
            {user.role === "organizer" && (
              <Link to="/organizer/dashboard">{t("For organizers")}</Link>
            )}
            {user.role === "platform_admin" && <Link to="/admin">{t("Admin")}</Link>}
            <Link to="/my-tickets">{t("My tickets")}</Link>
            <Link to="/my-orders">{t("My orders")}</Link>
            <Link to="/support">{t("Help")}</Link>
            <LanguagePicker />
            <button type="button" className="nav-btn" onClick={handleLogout}>
              {t("Log out")}
            </button>
          </>
        ) : (
          <>
            <Link to="/signup">{t("For organizers")}</Link>
            <LanguagePicker />
            <Link to="/login">{t("Log in")}</Link>
            <Link to="/signup" className="nav-btn">{t("Sign up")}</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export default Navbar;
