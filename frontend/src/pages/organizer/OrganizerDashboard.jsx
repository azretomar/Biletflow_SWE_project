import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import "./organizerDashboard.css";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_LABELS = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

function OrganizerDashboard() {
  const [filter, setFilter] = useState("all");

  const events = [];

  const visible = filter === "all" ? events : events.filter((ev) => ev.status === filter);

  return (
    <div className="dash">
      <Navbar />

      <main className="bf-page">
        <h1 className="bf-title">Organizer dashboard</h1>

        <div className="dash-toolbar">
          <div className="bf-chips dash-chips">
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
          <Link to="/create-event" className="bf-btn">Create event</Link>
        </div>

        {visible.length === 0 ? (
          <div className="dash-empty">
            <p>No events yet. Create your first event to get started.</p>
          </div>
        ) : (
          <div className="dash-list">
            {visible.map((ev) => (
              <article key={ev.id} className="bf-card dash-row">
                <div className="bf-img dash-img">Event image</div>
                <div className="dash-info">
                  <h3>{ev.title}</h3>
                  <p>{ev.date} | {ev.venue}</p>
                  <p className="dash-sold">{ev.sold} / {ev.capacity} sold</p>
                </div>
                <div className="dash-side">
                  <span className={`bf-badge bf-badge-${ev.status}`}>{STATUS_LABELS[ev.status]}</span>
                  <div className="dash-links">
                    {ev.status === "upcoming" && (
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