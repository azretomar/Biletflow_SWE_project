import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import EventImage from "../../components/EventImage";
import { useApi, statusNote } from "../../lib/useApi";
import { shortDateTime } from "../../lib/format";
import "./organizerDashboard.css";

// The organizer's own events (SRS 4.16: upcoming, active, completed, cancelled).
// GET /api/organizer/events (backend/organizer.go) ->
//   [{ id, title, date, venue, capacity, sold, image_url, ... }]; status "cancelled" comes later.
// Upcoming / active / completed are worked out from the date when the server does not send them.

const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_LABELS = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusOf(ev, now) {
  if (ev.status === "cancelled") return "cancelled";
  if (ev.status === "draft") return "draft";
  const start = new Date(ev.date);
  if (start > now) return "upcoming";
  return now - start < 12 * 60 * 60 * 1000 ? "active" : "completed";
}

function OrganizerDashboard() {
  const [filter, setFilter] = useState("all");
  const { data, status, error } = useApi("/organizer/events", []);
  const now = new Date();
  const events = (data || []).map((ev) => ({ ...ev, status: statusOf(ev, now) }));
  const visible = filter === "all" ? events : events.filter((ev) => ev.status === filter);
  const note = statusNote(status, error);

  return (
    <div className="dash">
      <Navbar />

      <main className="bf-page">
        <h1 className="bf-title">Organizer dashboard</h1>

        <div className="dash-toolbar">
          <div className="bf-chips dash-chips" role="group" aria-label="Filter events">
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
          <div className="dash-top-links">
            <Link to="/organizer/profile" className="bf-btn-outline">Profile</Link>
            <Link to="/organizer/promo" className="bf-btn-outline">Promo campaigns</Link>
            <Link to="/create-event" className="bf-btn">Create event</Link>
          </div>
        </div>

        {note && <p className="bf-muted dash-note" role="status">{note}</p>}

        {visible.length === 0 ? (
          <div className="dash-empty">
            <p>
              {events.length === 0
                ? "No events yet. Create your first event to get started."
                : `No ${filter} events.`}
            </p>
          </div>
        ) : (
          <div className="dash-list">
            {visible.map((ev) => (
              <article key={ev.id} className="bf-card dash-row">
                <EventImage src={ev.image_url} className="dash-img" />
                <div className="dash-info">
                  <h3>{ev.title}</h3>
                  <p>{shortDateTime(ev.date)} | {ev.venue}</p>
                  <p className="dash-sold">{ev.sold ?? 0} / {ev.capacity} sold</p>
                </div>
                <div className="dash-side">
                  <span className={`bf-badge bf-badge-${ev.status}`}>{STATUS_LABELS[ev.status]}</span>
                  <div className="dash-links">
                    {(ev.status === "upcoming" || ev.status === "draft") && (
                      <Link to={`/organizer/events/${ev.id}/edit`}>Edit&gt;</Link>
                    )}
                    {(ev.status === "completed" || ev.status === "cancelled") && (
                      <Link to={`/organizer/events/${ev.id}/history`}>Duplicate&gt;</Link>
                    )}
                    <Link to={`/organizer/events/${ev.id}`}>Manage&gt;</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default OrganizerDashboard;
