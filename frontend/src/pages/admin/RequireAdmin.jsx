import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import Navbar from "../../components/Navbar";

// Guards every /admin page (SRS 4.12): only Platform Admins may enter.
// - Not logged in  -> go to Log in, then come back here after logging in.
// - Logged in, but not a platform_admin -> "No access" message.
// The backend must still check the role on every admin endpoint;
// this guard only keeps the admin screens out of sight.
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
          <h1 className="bf-title">No access</h1>
          <p className="bf-muted">
            The admin area is only for BiletFlow platform administrators. You are logged in as{" "}
            <strong>{user.full_name || user.email}</strong> ({user.role}).
          </p>
          <Link to="/" className="bf-btn">Back to home</Link>
        </main>
      </div>
    );
  }

  return children;
}

export default RequireAdmin;
