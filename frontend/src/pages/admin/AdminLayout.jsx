import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../AuthContext";
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
          <Outlet />
        </main>
      </div>
    </AdminDataProvider>
  );
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
        BiletFlow <span>Admin</span>
      </Link>

      <nav className="admin-nav" aria-label="Admin sections">
        <NavLink to="/admin" end>
          Dashboard
        </NavLink>
        <NavLink to="/admin/events">
          Events
          {reportedEvents > 0 && <span className="nav-count" title="Reported events">{reportedEvents}</span>}
        </NavLink>
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/activations">
          Paid-sales activations
          {pendingActivations > 0 && <span className="nav-count" title="Pending">{pendingActivations}</span>}
        </NavLink>
        <NavLink to="/admin/support">Support cases</NavLink>
      </nav>

      <div className="admin-user">
        <span className="admin-user-label">Logged in as</span>
        <span className="admin-user-name">{user.full_name || user.email}</span>
        <button type="button" className="admin-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </aside>
  );
}

export default AdminLayout;
