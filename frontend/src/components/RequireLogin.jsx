import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import Navbar from "./Navbar";
import { roleName, t } from "../i18n";

// Wraps a page that needs a logged-in user.
// roles (optional): only these roles may open it, e.g. ["organizer"].
// Not logged in -> Log in, then back to this page. Wrong role -> short message.
function RequireLogin({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div>
        <Navbar />
        <main className="bf-page">
          <h1 className="bf-title">{t("No access")}</h1>
          <p className="bf-muted">
            {t("This page is only for {roles} accounts.", { roles: roles.map(roleName).join(t(" or ")) })}
          </p>
          <Link to="/" className="bf-btn">{t("Back to home")}</Link>
        </main>
      </div>
    );
  }

  return children;
}

export default RequireLogin;
