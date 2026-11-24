import { Link } from "react-router-dom";
import { useAdminData, eventDisplayStatus, formatDate } from "./AdminDataContext";
import { StatusBadge } from "./AdminComponents";
import { t } from "../../i18n";

// Screen 1: Admin dashboard (home) - a quick overview of the platform.
function AdminDashboard() {
  const { users, events, failedPayments, getUser } = useAdminData();

  const reportedEvents = events.filter((e) => e.reports.length > 0 && !e.suspended);
  const pendingActivations = events.filter((e) => e.activation && e.activation.paid_sales === "pending");
  const suspendedEvents = events.filter((e) => e.suspended).length;

  const stats = [
    { label: t("Users"), value: users.length, note: t("{n} organizers", { n: users.filter((u) => u.role === "organizer").length }), to: "/admin/users" },
    { label: t("Events"), value: events.length, note: t("{n} suspended", { n: suspendedEvents }), to: "/admin/events" },
    { label: t("Reported events"), value: reportedEvents.length, note: t("need review"), to: "/admin/events?filter=reported", alert: reportedEvents.length > 0 },
    { label: t("Pending activations"), value: pendingActivations.length, note: t("checklist not finished"), to: "/admin/activations" },
    { label: t("Failed payments"), value: failedPayments, note: t("last 7 days"), alert: failedPayments > 0 },
  ];

  return (
    <div className="admin-page">
      <h1>{t("Dashboard")}</h1>

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
          <h2>{t("Reported events to review")}</h2>
          <Link to="/admin/events?filter=reported">{t("See all")}</Link>
        </div>

        {reportedEvents.length === 0 ? (
          <p className="empty">{t("No reported events. Nice.")}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("Event")}</th>
                <th>{t("Organizer")}</th>
                <th>{t("Reports")}</th>
                <th>{t("Last report")}</th>
                <th>{t("Status")}</th>
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
