import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import QrCode from "../components/QrCode";
import "./printTicket.css";

// Printable ticket (SRS 4.7): one ticket on an A4 page.
// "Save as PDF" uses the browser's own print dialog (Print -> Save as PDF),
// so no PDF library is needed. The digital and printed copies share the same
// ticket id and QR code, so printing never creates a second admission.
//
// Data: GET /api/my-tickets (already in the backend), then the ticket with this id.

const STATUS_LABELS = {
  valid: "Valid",
  checked_in: "Checked in",
  cancelled: "Cancelled - not valid for entry",
  refunded: "Refunded - not valid for entry",
};

function eventDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return (
    d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
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
        const found = (tickets || []).find((t) => String(t.id) === String(id));
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
        <Link to={`/tickets/${id}`} className="bf-back">&lt;Back to ticket</Link>
        {state === "ready" && (
          <div className="pt-toolbar-actions">
            <span className="bf-muted">Choose "Save as PDF" in the print window to download.</span>
            <button type="button" className="bf-btn" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
          </div>
        )}
      </div>

      {state === "loading" && <p className="pt-message bf-muted">Loading your ticket...</p>}
      {state === "notfound" && (
        <p className="pt-message">
          Ticket not found in your account. <Link to="/my-tickets">Go to My tickets</Link>
        </p>
      )}
      {state === "error" && <p className="pt-message pt-error" role="alert">{error}</p>}

      {state === "ready" && (
        <article className={invalid ? "pt-sheet pt-invalid" : "pt-sheet"} aria-label="Printable ticket">
          <header className="pt-head">
            <span className="pt-brand">BiletFlow</span>
            <span className="pt-kind">Admission ticket</span>
          </header>

          <div className="pt-body">
            <div className="pt-info">
              <h1 className="pt-event">{ticket.event.title}</h1>
              <dl className="pt-fields">
                <dt>Date and time</dt>
                <dd>{eventDateTime(ticket.event.date)}</dd>
                <dt>Venue</dt>
                <dd>{ticket.event.venue || "-"}</dd>
                <dt>Ticket type</dt>
                <dd>{ticket.ticket_type.name}</dd>
                <dt>Attendee</dt>
                <dd>{user.full_name || user.email}</dd>
                <dt>Status</dt>
                <dd className="pt-status">{STATUS_LABELS[ticket.status] || ticket.status}</dd>
              </dl>
            </div>

            <div className="pt-qr">
              <QrCode value={ticket.qr_code} size={240} label={`QR code for ticket ${ticket.id}`} />
              <span className="pt-qr-hint">Show this code at the entrance</span>
            </div>
          </div>

          <footer className="pt-foot">
            <span>Ticket ID</span>
            <code className="pt-id">{ticket.id}</code>
            <p>
              One ticket admits one person once. The printed and the digital copy are the same ticket:
              after it is scanned, any other copy is no longer valid.
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}

export default PrintTicket;
