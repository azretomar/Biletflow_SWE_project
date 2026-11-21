import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import QrCode from "../components/QrCode";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { shortDateTime } from "../lib/format";
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
    const { id } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    api("/my-tickets").then((list) => {
      setTicket(list.find((t) => t.id === id) || null);
    });
  }, [id]);

  const rows = [
    ["Date", ticket ? shortDateTime(ticket.event.date) : "-"],
    ["Venue", ticket ? ticket.event.venue : "-"],
    ["Ticket type", ticket ? ticket.ticket_type.name : "-"],
    ["Attendee", user ? user.full_name : "-"],
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
              <h1>{ticket ? ticket.event.title : "Event name"}</h1>
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
              <Link to={`/tickets/${id}/print`} className="bf-btn">Download PDF</Link>
              <Link to={`/tickets/${id}/print`} className="bf-btn-outline">
                Print
              </Link>
            </div>
          </section>

          <aside className="bf-panel tv-qr">
            <QrCode value={ticket ? ticket.qr_code : ""} />
            <p className="tv-qr-id">{ticket ? ticket.id : "-"}</p>
            <p>Show this at the entrance</p>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default TicketView;