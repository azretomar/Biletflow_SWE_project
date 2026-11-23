import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { api } from "../../api";
import { useApi, statusNote } from "../../lib/useApi";
import "./eventHistory.css";

// Event history (SRS 4.16): a timeline of what happened to one event, filters by type and
// date, and "Duplicate event" to start a new event from this one.
//   GET /api/organizer/events/:id/history
// -> { event: { title, description, category, venue, capacity, date, image_url },
//      activity: [{ id, at, actor, type, message }] }
// type is one of: "event", "tickets", "orders", "checkin", "payments"
// ("support" once support-case changes are recorded by the backend).
const EMPTY_HISTORY = { event: null, activity: [] };

const FILTERS = [
  { value: "", label: "All" },
  { value: "event", label: "Event changes" },
  { value: "tickets", label: "Ticket types" },
  { value: "orders", label: "Orders and refunds" },
  { value: "checkin", label: "Check-in" },
  { value: "payments", label: "Paid sales" },
  { value: "support", label: "Support" },
];

const TYPE_LABELS = {
  event: "Event",
  tickets: "Tickets",
  orders: "Orders",
  checkin: "Check-in",
  payments: "Paid sales",
  support: "Support",
};

const KZ = "Asia/Almaty"; // the platform shows times in Kazakhstan time (UTC+5)

// "2026-11-21" for the Kazakhstan calendar day of a time.
function kzDay(value) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: KZ });
}

function dayHeading(day) {
  return new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: KZ,
  });
}

function timeOfDay(value) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KZ });
}

// Groups entries (newest first) by calendar day, so the list reads like a diary.
function groupByDay(entries) {
  const sorted = [...entries].sort((a, b) => new Date(b.at) - new Date(a.at));
  const groups = [];
  for (const entry of sorted) {
    const day = kzDay(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

function EventHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, status, error } = useApi(`/organizer/events/${id}/history`, EMPTY_HISTORY);
  const note = statusNote(status, error);
  const [filter, setFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState("");

  const visible = data.activity.filter((a) => {
    const day = kzDay(a.at);
    return (!filter || a.type === filter) && (!from || day >= from) && (!to || day <= to);
  });
  const groups = groupByDay(visible);

  // Duplicate (SRS 4.16, UC12): copies the event's settings and its ticket types into the
  // Create event form as a new event. Dates stay empty, because the copy needs its own;
  // orders, tickets, payments, check-ins and support cases are never copied.
  // Ticket types are copied with name, description, price and quantity (what the backend stores).
  async function duplicate() {
    setCopyError("");
    setCopying(true);
    try {
      const e = await api(`/events/${id}`);
      const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KZ }) : "");
      navigate("/create-event", {
        state: {
          duplicate: {
            title: e.title + " (copy)",
            description: e.description || "",
            category: e.category || "",
            image_url: e.image_url || "",
            venue: e.venue || "",
            venue_address: e.venue_address || "",
            capacity: e.capacity ? String(e.capacity) : "",
            visibility: e.visibility || "public",
            start_time: time(e.date),
            end_time: time(e.ends_at),
          },
          // Created after the new event is saved, with nothing sold.
          ticketTypes: (e.ticket_types || []).map((t) => ({
            name: t.name, description: t.description || "", price: t.price, quantity: t.quantity,
          })),
        },
      });
    } catch (err) {
      setCopyError(err.message);
      setCopying(false);
    }
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
              <button type="button" className="bf-btn" onClick={duplicate} disabled={!data.event || copying}>
                {copying ? "Copying..." : "Duplicate event"}
              </button>
              {!data.event && <span className="bf-muted eh-hint">Available once the event is loaded.</span>}
              {copyError && <span className="eh-hint eh-error" role="alert">{copyError}</span>}
          </div>
        </div>

        {note && <p className="bf-muted eh-note" role="status">{note}</p>}

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
        <div className="eh-dates" role="group" aria-label="Filter by date">
          <label className="bf-label" htmlFor="eh-from">From</label>
          <input id="eh-from" type="date" className="bf-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="bf-label" htmlFor="eh-to">To</label>
          <input id="eh-to" type="date" className="bf-input" value={to} onChange={(e) => setTo(e.target.value)} />
          {(from || to) && (
            <button type="button" className="eh-clear" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button>
          )}
        </div>

        <section className="bf-card eh-card" aria-label="Activity">
          {groups.length === 0 ? (
            <p className="bf-muted eh-empty">
              {data.activity.length === 0
                ? "No activity yet. Changes to this event, its tickets and orders will appear here."
                : "No activity matches these filters."}
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
