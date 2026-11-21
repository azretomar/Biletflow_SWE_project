import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import EventImage from "../components/EventImage";
import { useApi, statusNote } from "../lib/useApi";
import { shortDateTime } from "../lib/format";
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

  const { data: tickets, status, error, reload } = useApi("/my-tickets", []);

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
              aria-pressed={filter === f.value}
              className={filter === f.value ? "bf-chip bf-chip-active" : "bf-chip"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {status === "loading" ? (
          <p className="bf-muted">Loading your tickets...</p>
        ) : status !== "ready" ? (
          <div className="mt-empty" role="alert">
            <p>{statusNote(status, error)}</p>
            <button type="button" className="bf-btn-outline" onClick={reload}>Try again</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-empty">
            <p>
              {tickets.length === 0 ? "No tickets yet. " : "No tickets with this status. "}
              <Link to="/events">Find an event</Link>
            </p>
          </div>
        ) : (
          <div className="mt-list">
            {visible.map((t) => (
              <article key={t.id} className="bf-card mt-row">
                <EventImage src={t.event.image_url} className="mt-img" />
                <div className="mt-info">
                  <h3>{t.event.title}</h3>
                  <p>{shortDateTime(t.event.date)}{t.event.venue ? ` · ${t.event.venue}` : ""}</p>
                  <p className="mt-type">{t.ticket_type.name}</p>
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