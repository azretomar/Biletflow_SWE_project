import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./myTickets.css";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "valid", label: "Valid" },
  { value: "checked_in", label: "Checked in" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

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

function MyTickets() {
  const [filter, setFilter] = useState("all");

  // Tickets will come from the backend: GET /api/my-tickets
  const tickets = [];

  const visible = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  return (
    <div className="mt">
      <Navbar />

      <main className="bf-page">
        <h1 className="bf-title">My tickets</h1>

        <div className="bf-chips">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={filter === f.value ? "bf-chip bf-chip-active" : "bf-chip"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="mt-empty">
            <p>No tickets yet. Register for an event to get one.</p>
          </div>
        ) : (
          <div className="mt-list">
            {visible.map((t) => (
              <article key={t.id} className="bf-card mt-row">
                <div className="bf-img mt-img">Event image</div>
                <div className="mt-info">
                  <h3>{t.event_title}</h3>
                  <p>{t.date}</p>
                  <p className="mt-type">{t.ticket_type}</p>
                </div>
                <div className="mt-side">
                  <span className={`bf-badge ${STATUS_CLASSES[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                  <Link to={`/tickets/${t.id}`}>View ticket &gt;</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default MyTickets;