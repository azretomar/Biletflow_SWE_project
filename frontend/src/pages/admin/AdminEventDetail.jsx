import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAdminData, eventDisplayStatus, formatDateTime, formatDate, formatKzt } from "./AdminDataContext";
import { StatusBadge, ConfirmDialog } from "./AdminComponents";

// Screen 3: Event detail (admin view) - info, organizer, sales, reports,
// and the two admin actions: suspend event / stop paid sales.
function AdminEventDetail() {
  const { id } = useParams(); // the number in the address, e.g. /admin/events/103
  const { getEvent, getUser, setEventSuspended, setPaidSalesStopped } = useAdminData();
  const [dialog, setDialog] = useState(null); // "suspend" | "restore" | "stop-sales" | "resume-sales"

  const event = getEvent(Number(id));

  if (!event) {
    return (
      <div className="admin-page">
        <Link to="/admin/events" className="back-link">← All events</Link>
        <h1>Event not found</h1>
      </div>
    );
  }

  const organizer = getUser(event.organizer_id);
  const percentSold = Math.round((event.tickets_sold / event.capacity) * 100);
  const paidSales = event.activation ? event.activation.paid_sales : null;

  const dialogs = {
    suspend: {
      title: "Suspend event?",
      message: "The event will be hidden from attendees and all ticket sales will stop.",
      confirmLabel: "Suspend event",
      danger: true,
      run: () => setEventSuspended(event.id, true),
    },
    restore: {
      title: "Restore event?",
      message: "The event will be visible again. Paid sales stay stopped until you resume them.",
      confirmLabel: "Restore",
      run: () => setEventSuspended(event.id, false),
    },
    "stop-sales": {
      title: "Stop paid sales?",
      message: "Attendees will not be able to buy paid tickets. The event page stays visible.",
      confirmLabel: "Stop paid sales",
      danger: true,
      run: () => setPaidSalesStopped(event.id, true),
    },
    "resume-sales": {
      title: "Resume paid sales?",
      message: "Attendees will be able to buy paid tickets again.",
      confirmLabel: "Resume sales",
      run: () => setPaidSalesStopped(event.id, false),
    },
  };
  const current = dialog ? dialogs[dialog] : null;

  return (
    <div className="admin-page">
      <Link to="/admin/events" className="back-link">← All events</Link>

      <div className="detail-header">
        <div>
          <h1>{event.title}</h1>
          <div className="detail-meta">
            <StatusBadge status={eventDisplayStatus(event)} />
            {paidSales && <StatusBadge status={"sales_" + paidSales} />}
            <span>Event #{event.id}</span>
          </div>
        </div>

        <div className="detail-actions">
          {paidSales === "active" && !event.suspended && (
            <button type="button" className="btn-small btn-secondary" onClick={() => setDialog("stop-sales")}>
              Stop paid sales
            </button>
          )}
          {paidSales === "stopped" && !event.suspended && (
            <button type="button" className="btn-small btn-secondary" onClick={() => setDialog("resume-sales")}>
              Resume paid sales
            </button>
          )}
          {event.suspended ? (
            <button type="button" className="btn-small" onClick={() => setDialog("restore")}>
              Restore event
            </button>
          ) : (
            event.status !== "cancelled" && (
              <button type="button" className="btn-small btn-danger" onClick={() => setDialog("suspend")}>
                Suspend event
              </button>
            )
          )}
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h2>Event info</h2>
          <dl className="info-list">
            <dt>Date</dt>
            <dd>{formatDateTime(event.start_at)}</dd>
            <dt>Venue</dt>
            <dd>{event.venue}</dd>
            <dt>Category</dt>
            <dd className="capitalize">{event.category}</dd>
            <dt>Ticket sales</dt>
            <dd>{event.activation ? "Paid tickets" : "Free tickets only"}</dd>
          </dl>
        </section>

        <section className="panel">
          <h2>Organizer</h2>
          {organizer ? (
            <dl className="info-list">
              <dt>Name</dt>
              <dd>{organizer.full_name}</dd>
              <dt>Email</dt>
              <dd>{organizer.email}</dd>
              <dt>Joined</dt>
              <dd>{formatDate(organizer.created_at)}</dd>
              <dt>Account</dt>
              <dd><StatusBadge status={organizer.suspended ? "suspended" : "active"} /></dd>
            </dl>
          ) : (
            <p className="empty">Organizer not found.</p>
          )}
        </section>

        <section className="panel">
          <h2>Sales</h2>
          <div className="sales-numbers">
            <div>
              <span className="stat-value">{event.tickets_sold}</span>
              <span className="stat-note">of {event.capacity} tickets sold</span>
            </div>
            <div>
              <span className="stat-value">{formatKzt(event.revenue_kzt)}</span>
              <span className="stat-note">demo revenue</span>
            </div>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={percentSold}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Percent of tickets sold"
          >
            <div className="progress-bar" style={{ width: Math.min(percentSold, 100) + "%" }} />
          </div>
          <span className="stat-note">{percentSold}% sold</span>
        </section>
      </div>

      <section className="panel">
        <h2>Reports from users ({event.reports.length})</h2>
        {event.reports.length === 0 ? (
          <p className="empty">Nobody has reported this event.</p>
        ) : (
          <ul className="report-list">
            {event.reports.map((r) => (
              <li key={r.id}>
                <p>{r.reason}</p>
                <span className="cell-sub">{r.reporter} · {formatDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {current && (
        <ConfirmDialog
          title={current.title}
          message={current.message}
          confirmLabel={current.confirmLabel}
          danger={current.danger}
          needsReason
          onConfirm={() => {
            current.run();
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export default AdminEventDetail;
