import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./ticketView.css";

const STATUS_LABELS = {
  valid: "Valid",
  checked_in: "Checked in",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_CLASSES = {
  valid: "bf-badge-valid",
  checked_in: "bf-badge-checkedin",
  cancelled: "bf-badge-cancelled",
  refunded: "bf-badge-refunded",
};

function TicketView() {
  // The ticket will come from the backend using the id in the URL (/tickets/:id).
  const ticket = null;

  const rows = [
    ["Date", ticket ? ticket.date : "-"],
    ["Venue", ticket ? ticket.venue : "-"],
    ["Ticket type", ticket ? ticket.ticket_type : "-"],
    ["Attendee", ticket ? ticket.attendee : "-"],
    ["Ticket ID", ticket ? ticket.id : "-"],
  ];

  return (
    <div className="tv">
      <Navbar />

      <main className="bf-page">
        <Link to="/my-tickets" className="bf-back">&lt;Back to My tickets</Link>

        <div className="tv-grid">
          <section>
            <div className="tv-head">
              <h1>{ticket ? ticket.event_title : "Event name"}</h1>
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
              <button type="button" className="bf-btn">Download PDF</button>
              <button type="button" className="bf-btn-outline" onClick={() => window.print()}>
                Print
              </button>
            </div>
          </section>

          <aside className="bf-panel tv-qr">
            <div className="bf-img tv-qr-img">QR code</div>
            <p className="tv-qr-id">{ticket ? ticket.id : "-"}</p>
            <p>Show this at the entrance</p>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default TicketView;