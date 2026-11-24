import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import QrCode from "../components/QrCode";
import "./printTicket.css";
import { locale, t } from "../i18n";

// Printable ticket (SRS 4.7): one ticket on an A4 page.
// "Save as PDF" uses the browser's own print dialog (Print -> Save as PDF),
// so no PDF library is needed. The digital and printed copies share the same
// ticket id and QR code, so printing never creates a second admission.
//
// Data: GET /api/my-tickets (already in the backend), then the ticket with this id.

const STATUS_LABELS = {
  get valid() { return t("Valid"); },
  get checked_in() { return t("Checked in"); },
  get cancelled() { return t("Cancelled - not valid for entry"); },
  get refunded() { return t("Refunded - not valid for entry"); },
};

function eventDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return (
    d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
  );
}

function PrintTicket() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [ticket, setTicket] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notfound | error
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    api("/my-tickets")
      .then((tickets) => {
        if (!active) return;
        const found = (tickets || []).find((tt) => String(tt.id) === String(id));
        setTicket(found || null);
        setState(found ? "ready" : "notfound");
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [id, user]);

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const invalid = ticket && (ticket.status === "cancelled" || ticket.status === "refunded");

  return (
    <div className="pt">
      <div className="pt-toolbar">
        <Link to={`/tickets/${id}`} className="bf-back">&lt;{t("Back to ticket")}</Link>
        {state === "ready" && (
          <div className="pt-toolbar-actions">
            <span className="bf-muted">{t("Choose \"Save as PDF\" in the print window to download.")}</span>
            <button type="button" className="bf-btn" onClick={() => window.print()}>
              {t("Print / Save as PDF")}
            </button>
          </div>
        )}
      </div>

      {state === "loading" && <p className="pt-message bf-muted">{t("Loading your ticket...")}</p>}
      {state === "notfound" && (
        <p className="pt-message">
          {t("Ticket not found in your account.")} <Link to="/my-tickets">{t("Go to My tickets")}</Link>
        </p>
      )}
      {state === "error" && <p className="pt-message pt-error" role="alert">{error}</p>}

      {state === "ready" && (
        <article className={invalid ? "pt-sheet pt-invalid" : "pt-sheet"} aria-label={t("Printable ticket")}>
          <header className="pt-head">
            <span className="pt-brand">BiletFlow</span>
            <span className="pt-kind">{t("Admission ticket")}</span>
          </header>

          <div className="pt-body">
            <div className="pt-info">
              <h1 className="pt-event">{ticket.event.title}</h1>
              <dl className="pt-fields">
                <dt>{t("Date and time")}</dt>
                <dd>{eventDateTime(ticket.event.date)}</dd>
                <dt>{t("Venue")}</dt>
                <dd>{ticket.event.venue || "-"}</dd>
                <dt>{t("Ticket type")}</dt>
                <dd>{ticket.ticket_type.name}</dd>
                <dt>{t("Attendee")}</dt>
                <dd>{user.full_name || user.email}</dd>
                <dt>{t("Status")}</dt>
                <dd className="pt-status">{STATUS_LABELS[ticket.status] || ticket.status}</dd>
              </dl>
            </div>

            <div className="pt-qr">
              <QrCode value={ticket.qr_code} size={240} label={t("QR code for ticket {id}", { id: ticket.id })} />
              <span className="pt-qr-hint">{t("Show this code at the entrance")}</span>
            </div>
          </div>

          <footer className="pt-foot">
            <span>{t("Ticket ID")}</span>
            <code className="pt-id">{ticket.id}</code>
            <p>
              {t("One ticket admits one person once. The printed and the digital copy are the same ticket: after it is scanned, any other copy is no longer valid.")}
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}

export default PrintTicket;
