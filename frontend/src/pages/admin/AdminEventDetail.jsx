import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAdminData, eventDisplayStatus, formatDateTime, formatDate, formatKzt } from "./AdminDataContext";
import { StatusBadge, ConfirmDialog } from "./AdminComponents";
import { t } from "../../i18n";
import { categoryName } from "../../lib/events";

function AdminEventDetail() {
  const { id } = useParams();
  const { getEvent, getUser, setEventSuspended, setPaidSalesStopped } = useAdminData();
  const [dialog, setDialog] = useState(null);

  const event = getEvent(id);

  if (!event) {
    return (
      <div className="admin-page">
        <Link to="/admin/events" className="back-link">← {t("All events")}</Link>
        <h1>{t("Event not found")}</h1>
      </div>
    );
  }

  const organizer = getUser(event.organizer_id);
  const percentSold = Math.round((event.tickets_sold / event.capacity) * 100);
  const paidSales = event.activation ? event.activation.paid_sales : null;

  const dialogs = {
    suspend: {
      title: t("Suspend event?"),
      message: t("The event will be hidden from attendees and all ticket sales will stop."),
      confirmLabel: t("Suspend event"),
      danger: true,
      run: (reason) => setEventSuspended(event.id, true, reason),
    },
    restore: {
      title: t("Restore event?"),
      message: t("The event will be visible again. Paid sales stay stopped until you resume them."),
      confirmLabel: t("Restore"),
      run: (reason) => setEventSuspended(event.id, false, reason),
    },
    "stop-sales": {
      title: t("Stop paid sales?"),
      message: t("Attendees will not be able to buy paid tickets. The event page stays visible."),
      confirmLabel: t("Stop paid sales"),
      danger: true,
      run: (reason) => setPaidSalesStopped(event.id, true, reason),
    },
    "resume-sales": {
      title: t("Resume paid sales?"),
      message: t("Attendees will be able to buy paid tickets again."),
      confirmLabel: t("Resume sales"),
      run: (reason) => setPaidSalesStopped(event.id, false, reason),
    },
  };
  const current = dialog ? dialogs[dialog] : null;

  return (
    <div className="admin-page">
      <Link to="/admin/events" className="back-link">← {t("All events")}</Link>

      <div className="detail-header">
        <div>
          <h1>{event.title}</h1>
          <div className="detail-meta">
            <StatusBadge status={eventDisplayStatus(event)} />
            {paidSales && <StatusBadge status={"sales_" + paidSales} />}
            <span>{t("Event #{id}", { id: event.id })}</span>
          </div>
        </div>

        <div className="detail-actions">
          {paidSales === "active" && !event.suspended && (
            <button type="button" className="btn-small btn-secondary" onClick={() => setDialog("stop-sales")}>
              {t("Stop paid sales")}
            </button>
          )}
          {paidSales === "stopped" && !event.suspended && (
            <button type="button" className="btn-small btn-secondary" onClick={() => setDialog("resume-sales")}>
              {t("Resume paid sales")}
            </button>
          )}
          {event.suspended ? (
            <button type="button" className="btn-small" onClick={() => setDialog("restore")}>
              {t("Restore event")}
            </button>
          ) : (
            event.status !== "cancelled" && (
              <button type="button" className="btn-small btn-danger" onClick={() => setDialog("suspend")}>
                {t("Suspend event")}
              </button>
            )
          )}
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <h2>{t("Event info")}</h2>
          <dl className="info-list">
            <dt>{t("Date")}</dt>
            <dd>{formatDateTime(event.start_at)}</dd>
            <dt>{t("Venue")}</dt>
            <dd>{event.venue}</dd>
            <dt>{t("Category")}</dt>
            <dd className="capitalize">{categoryName(event.category)}</dd>
            <dt>{t("Ticket sales")}</dt>
            <dd>{event.activation ? t("Paid tickets") : t("Free tickets only")}</dd>
          </dl>
        </section>

        <section className="panel">
          <h2>{t("Organizer")}</h2>
          {organizer ? (
            <dl className="info-list">
              <dt>{t("Name")}</dt>
              <dd>{organizer.full_name}</dd>
              <dt>{t("Email")}</dt>
              <dd>{organizer.email}</dd>
              <dt>{t("Joined")}</dt>
              <dd>{formatDate(organizer.created_at)}</dd>
              <dt>{t("Account")}</dt>
              <dd><StatusBadge status={organizer.suspended ? "suspended" : "active"} /></dd>
            </dl>
          ) : (
            <p className="empty">{t("Organizer not found.")}</p>
          )}
        </section>

        <section className="panel">
          <h2>{t("Sales")}</h2>
          <div className="sales-numbers">
            <div>
              <span className="stat-value">{event.tickets_sold}</span>
              <span className="stat-note">{t("of {n} tickets sold", { n: event.capacity })}</span>
            </div>
            <div>
              <span className="stat-value">{formatKzt(event.revenue_kzt)}</span>
              <span className="stat-note">{t("demo revenue")}</span>
            </div>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={percentSold}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("Percent of tickets sold")}
          >
            <div className="progress-bar" style={{ width: Math.min(percentSold, 100) + "%" }} />
          </div>
          <span className="stat-note">{t("{n}% sold", { n: percentSold })}</span>
        </section>
      </div>

      <section className="panel">
        <h2>{t("Reports from users ({n})", { n: event.reports.length })}</h2>
        {event.reports.length === 0 ? (
          <p className="empty">{t("Nobody has reported this event.")}</p>
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
          onConfirm={(reason) => {
            current.run(reason);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export default AdminEventDetail;
