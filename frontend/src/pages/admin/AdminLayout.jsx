import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import { t } from "../../i18n";
import LanguagePicker from "../../components/LanguagePicker";
import { AdminDataProvider, useAdminData } from "./AdminDataContext";
import "./admin.css";

// The frame around every admin page: a sidebar on the left,
// the current page on the right (<Outlet /> is where the page appears).
function AdminLayout() {
  return (
    <AdminDataProvider>
      <div className="admin">
        <AdminSidebar />
        <main className="admin-main">
          <AdminNotice />
          <Outlet />
        </main>
      </div>
    </AdminDataProvider>
  );
}

// Shows loading, "not connected yet", or why the last admin action failed.
function AdminNotice() {
  const { notice } = useAdminData();
  if (!notice) return null;
  return <p className="admin-notice" role="status">{notice}</p>;
}

function AdminSidebar() {
  const { events } = useAdminData();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  const pendingActivations = events.filter(
    (e) => e.activation && e.activation.paid_sales === "pending"
  ).length;
  const reportedEvents = events.filter((e) => e.reports.length > 0 && !e.suspended).length;

  return (
    <aside className="admin-sidebar">
      <Link to="/" className="admin-logo">
        BiletFlow <span>{t("Admin")}</span>
      </Link>

      <nav className="admin-nav" aria-label={t("Admin sections")}>
        <NavLink to="/admin" end>
          {t("Dashboard")}
        </NavLink>
        <NavLink to="/admin/events">
          {t("Events")}
          {reportedEvents > 0 && <span className="nav-count" title={t("Reported events")}>{reportedEvents}</span>}
        </NavLink>
        <NavLink to="/admin/users">{t("Users")}</NavLink>
        <NavLink to="/admin/activations">
          {t("Paid-sales activations")}
          {pendingActivations > 0 && <span className="nav-count" title={t("Pending")}>{pendingActivations}</span>}
        </NavLink>
        <NavLink to="/admin/support">{t("Support cases")}</NavLink>
      </nav>

      <div className="admin-user">
        <span className="admin-user-label">{t("Logged in as")}</span>
        <span className="admin-user-name">{user.full_name || user.email}</span>
        <button type="button" className="admin-logout" onClick={handleLogout}>
          {t("Log out")}
        </button>
        <LanguagePicker />
      </div>
    </aside>
  );
}

export default AdminLayout;
