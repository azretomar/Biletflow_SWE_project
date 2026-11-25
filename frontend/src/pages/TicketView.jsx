import { Link, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import QrCode from "../components/QrCode";
import { useAuth } from "../AuthContext";
import { useApi, statusNote } from "../lib/useApi";
import { shortDateTime } from "../lib/format";
import "./ticketView.css";
import { t } from "../i18n";

const STATUS_LABELS = {
  get valid() { return t("Valid"); },
  get checked_in() { return t("Checked in"); },
  get cancelled() { return t("Cancelled"); },
  get refunded() { return t("Refunded"); },
};

const STATUS_CLASSES = {
  valid: "bf-badge-valid",
  checked_in: "bf-badge-checkedin",
  cancelled: "bf-badge-cancelled",
  refunded: "bf-badge-refunded",
};

function TicketView() {
    const { id } = useParams();
  const { user } = useAuth();
  const { data: tickets, status, error, reload } = useApi("/my-tickets", []);
  const ticket = (tickets || []).find((tt) => String(tt.id) === String(id)) || null;

  const rows = [
    [t("Date"), ticket ? shortDateTime(ticket.event.date) : "-"],
    [t("Venue"), ticket ? ticket.event.venue : "-"],
    [t("Ticket type"), ticket ? ticket.ticket_type.name : "-"],
    [t("Attendee"), user ? user.full_name : "-"],
    [t("Ticket ID"), ticket ? ticket.id : "-"],
  ];

  return (
    <div className="tv">
      <Navbar />

      <main className="bf-page">
        <Link to="/my-tickets" className="bf-back">&lt;{t("Back to My tickets")}</Link>

        {status === "loading" && <p className="bf-muted">{t("Loading ticket...")}</p>}
        {status !== "loading" && status !== "ready" && (
          <div role="alert">
            <p>{statusNote(status, error)}</p>
            <button type="button" className="bf-btn-outline" onClick={reload}>{t("Try again")}</button>
          </div>
        )}
        {status === "ready" && !ticket && (
          <p role="alert">{t("This ticket is not in your account.")} <Link to="/my-tickets">{t("Go to My tickets")}</Link></p>
        )}

        {ticket && (
        <div className="tv-grid">
          <section>
            <div className="tv-head">
              <h1>{ticket ? ticket.event.title : t("Event name")}</h1>
              {ticket && (
                <span className={`bf-badge ${STATUS_CLASSES[ticket.status]}`}>
                  {STATUS_LABELS[ticket.status]}
                </span>
              )}
            </div>

            <dl className="tv-details">
              {rows.map(([label, value]) => (
                <div key={label} className="tv-detail">
                  <dt className="bf-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="tv-actions">
              <Link to={`/tickets/${id}/print`} className="bf-btn">{t("Download PDF")}</Link>
              <Link to={`/tickets/${id}/print`} className="bf-btn-outline">
                {t("Print")}
              </Link>
            </div>
            <p className="tv-help">
              {t("Problem with this ticket?")} <Link to={`/support/new?ticket=${id}`}>{t("Contact support")}</Link>
            </p>
          </section>

          <aside className="bf-panel tv-qr">
            {ticket && (ticket.status === "refunded" || ticket.status === "cancelled") ? (
              <p>{t("This ticket is no longer valid.")}</p>
            ) : (
              <>
                <QrCode value={ticket ? ticket.qr_code : ""} />
                <p className="tv-qr-id">{ticket ? ticket.id : "-"}</p>
                <p>{t("Show this at the entrance")}</p>
              </>
            )}
          </aside>
        </div>
        )}
      </main>
    </div>
  );
}

export default TicketView;
