import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import "./eventHistory.css";

// Event history for organizers (SRS 4.16): a timeline of what happened to one
// event, and "Duplicate event" to start a new event from this one.
//
// Until the endpoint exists the page starts empty. Expected response of
// GET /api/organizer/events/:id/history (proposal, agree with backend):
// {
//   event: { title, description, category, venue, capacity, date },
//   activity: [{ id, at: "2026-11-01T14:05", actor: "Aigerim N.", type, message }]
// }
// type is one of: "event", "tickets", "orders", "checkin", "payments".
const EMPTY_HISTORY = { event: null, activity: [] };

const FILTERS = [
  { value: "", label: "All" },
  { value: "event", label: "Event changes" },
  { value: "tickets", label: "Ticket types" },
  { value: "orders", label: "Orders and refunds" },
  { value: "checkin", label: "Check-in" },
  { value: "payments", label: "Paid sales" },
];

const TYPE_LABELS = {
  event: "Event",
  tickets: "Tickets",
  orders: "Orders",
  checkin: "Check-in",
  payments: "Paid sales",
};

function dayHeading(value) {
  return new Date(value).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function timeOfDay(value) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// Groups entries (newest first) by calendar day, so the list reads like a diary.
function groupByDay(entries) {
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at));
  const groups = [];
  for (const entry of sorted) {
    const day = entry.at.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

function EventHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data] = useState(EMPTY_HISTORY);
  const [filter, setFilter] = useState("");

  const visible = data.activity.filter((a) => !filter || a.type === filter);
  const groups = groupByDay(visible);

  // Copies the event details into the Create event form. The date is left empty
  // on purpose: a duplicated event needs its own new date. Tickets, orders and
  // attendees are never copied.
  function duplicate() {
    const e = data.event;
    navigate("/create-event", {
      state: {
        duplicate: {
          title: e.title + " (copy)",
          description: e.description || "",
          category: e.category || "",
          venue: e.venue || "",
          capacity: e.capacity ? String(e.capacity) : "",
          date: "",
        },
      },
    });
  }

  return (
    <div className="eh">
      <Navbar />

      <main className="bf-page eh-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;Back to Event management</Link>

        <div className="eh-head">
          <div>
            <h1 className="bf-title eh-title">Event history</h1>
            <p className="bf-muted eh-subtitle">{data.event ? data.event.title : "Event name"}</p>
          </div>
          <div className="eh-actions">
            <button type="button" className="bf-btn" onClick={duplicate} disabled={!data.event}>
              Duplicate event
            </button>
            {!data.event && <span className="bf-muted eh-hint">Available once the event is loaded.</span>}
          </div>
        </div>

        <div className="bf-chips" role="group" aria-label="Filter activity">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={filter === f.value ? "bf-chip bf-chip-active" : "bf-chip"}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <section className="bf-card eh-card" aria-label="Activity">
          {groups.length === 0 ? (
            <p className="bf-muted eh-empty">
              {data.activity.length === 0
                ? "No activity yet. Changes to this event, its tickets and orders will appear here."
                : "No activity of this type."}
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.day} className="eh-day">
                <h2 className="eh-day-title">{dayHeading(g.day)}</h2>
                <ol className="eh-list">
                  {g.entries.map((a) => (
                    <li key={a.id} className="eh-item">
                      <time className="eh-time" dateTime={a.at}>{timeOfDay(a.at)}</time>
                      <span className={"eh-dot eh-dot-" + a.type} aria-hidden="true" />
                      <div className="eh-body">
                        <p className="eh-message">{a.message}</p>
                        <span className="bf-muted eh-meta">
                          {a.actor} · {TYPE_LABELS[a.type] || a.type}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}

export default EventHistory;
