import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import Navbar from "../../components/Navbar";
import { roleName, t } from "../../i18n";

function RequireAdmin({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.role !== "platform_admin") {
    return (
      <div className="ra">
        <Navbar />
        <main className="bf-page ra-page">
          <h1 className="bf-title">{t("No access")}</h1>
          <p className="bf-muted">
            {t("The admin area is only for BiletFlow platform administrators. You are logged in as")}{" "}
            <strong>{user.full_name || user.email}</strong> ({roleName(user.role)}).
          </p>
          <Link to="/" className="bf-btn">{t("Back to home")}</Link>
        </main>
      </div>
    );
  }

  return children;
}

export default RequireAdmin;
