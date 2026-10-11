import { Link } from "react-router-dom";
import { useAdminData, eventDisplayStatus, formatDate } from "./AdminDataContext";
import { StatusBadge } from "./AdminComponents";

// Screen 1: Admin dashboard (home) - a quick overview of the platform.
function AdminDashboard() {
  const { users, events, failedPayments, getUser } = useAdminData();

  const reportedEvents = events.filter((e) => e.reports.length > 0 && !e.suspended);
  const pendingActivations = events.filter((e) => e.activation && e.activation.paid_sales === "pending");
  const suspendedEvents = events.filter((e) => e.suspended).length;

  const stats = [
    { label: "Users", value: users.length, note: users.filter((u) => u.role === "organizer").length + " organizers", to: "/admin/users" },
    { label: "Events", value: events.length, note: suspendedEvents + " suspended", to: "/admin/events" },
    { label: "Reported events", value: reportedEvents.length, note: "need review", to: "/admin/events?filter=reported", alert: reportedEvents.length > 0 },
    { label: "Pending activations", value: pendingActivations.length, note: "checklist not finished", to: "/admin/activations" },
    { label: "Failed payments", value: failedPayments, note: "last 7 days", alert: failedPayments > 0 },
  ];

  return (
    <div className="admin-page">
      <h1>Dashboard</h1>

      <div className="stat-grid">
        {stats.map((s) => {
          const content = (
            <>
              <span className="stat-label">{s.label}</span>
              <span className="stat-value">{s.value}</span>
              <span className="stat-note">{s.note}</span>
            </>
          );
          const className = "stat-card" + (s.alert ? " stat-alert" : "");
          return s.to ? (
            <Link key={s.label} to={s.to} className={className}>{content}</Link>
          ) : (
            <div key={s.label} className={className}>{content}</div>
          );
        })}
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Reported events to review</h2>
          <Link to="/admin/events?filter=reported">See all</Link>
        </div>

        {reportedEvents.length === 0 ? (
          <p className="empty">No reported events. Nice.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Organizer</th>
                <th>Reports</th>
                <th>Last report</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...reportedEvents]
                .sort((a, b) => b.reports.length - a.reports.length)
                .map((e) => (
                  <tr key={e.id}>
                    <td><Link to={"/admin/events/" + e.id}>{e.title}</Link></td>
                    <td>{getUser(e.organizer_id)?.full_name}</td>
                    <td><strong>{e.reports.length}</strong></td>
                    <td>{formatDate(e.reports[e.reports.length - 1].created_at)}</td>
                    <td><StatusBadge status={eventDisplayStatus(e)} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default AdminDashboard;
