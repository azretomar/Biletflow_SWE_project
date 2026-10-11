import { NavLink, Outlet, Link } from "react-router-dom";
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
      </nav>
    </aside>
  );
}

export default AdminLayout;
