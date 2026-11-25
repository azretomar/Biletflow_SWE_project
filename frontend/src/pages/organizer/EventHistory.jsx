import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { api } from "../../api";
import { useApi, statusNote } from "../../lib/useApi";
import "./eventHistory.css";
import { locale, t } from "../../i18n";

const EMPTY_HISTORY = { event: null, activity: [] };

const FILTERS = [
  { value: "", get label() { return t("All"); } },
  { value: "event", get label() { return t("Event changes"); } },
  { value: "tickets", get label() { return t("Ticket types"); } },
  { value: "orders", get label() { return t("Orders and refunds"); } },
  { value: "checkin", get label() { return t("Check-in"); } },
  { value: "payments", get label() { return t("Paid sales"); } },
  { value: "support", get label() { return t("Support"); } },
];

const TYPE_LABELS = {
  get event() { return t("Event"); },
  get tickets() { return t("Tickets"); },
  get orders() { return t("Orders"); },
  get checkin() { return t("Check-in"); },
  get payments() { return t("Paid sales"); },
  get support() { return t("Support"); },
};

const KZ = "Asia/Almaty";

function kzDay(value) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: KZ });
}

function dayHeading(day) {
  return new Date(day + "T12:00:00Z").toLocaleDateString(locale(), {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: KZ,
  });
}

function timeOfDay(value) {
  return new Date(value).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", timeZone: KZ });
}

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

  async function duplicate() {
    setCopyError("");
    setCopying(true);
    try {
      const e = await api(`/events/${id}`);
      const time = (iso) => (iso ? new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", timeZone: KZ }) : "");
      navigate("/create-event", {
        state: {
          duplicate: {
            title: e.title + " " + t("(copy)"),
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
          ticketTypes: (e.ticket_types || []).map((tt) => ({
            name: tt.name, description: tt.description || "", price: tt.price, quantity: tt.quantity,
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
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;{t("Back to Event management")}</Link>

        <div className="eh-head">
          <div>
            <h1 className="bf-title eh-title">{t("Event history")}</h1>
            <p className="bf-muted eh-subtitle">{data.event ? data.event.title : t("Event name")}</p>
          </div>
          <div className="eh-actions">
              <button type="button" className="bf-btn" onClick={duplicate} disabled={!data.event || copying}>
                {copying ? t("Copying...") : t("Duplicate event")}
              </button>
              {!data.event && <span className="bf-muted eh-hint">{t("Available once the event is loaded.")}</span>}
              {copyError && <span className="eh-hint eh-error" role="alert">{copyError}</span>}
          </div>
        </div>

        {note && <p className="bf-muted eh-note" role="status">{note}</p>}

        <div className="bf-chips" role="group" aria-label={t("Filter activity")}>
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
        <div className="eh-dates" role="group" aria-label={t("Filter by date")}>
          <label className="bf-label" htmlFor="eh-from">{t("From")}</label>
          <input id="eh-from" type="date" className="bf-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="bf-label" htmlFor="eh-to">{t("To")}</label>
          <input id="eh-to" type="date" className="bf-input" value={to} onChange={(e) => setTo(e.target.value)} />
          {(from || to) && (
            <button type="button" className="eh-clear" onClick={() => { setFrom(""); setTo(""); }}>{t("Clear dates")}</button>
          )}
        </div>

        <section className="bf-card eh-card" aria-label={t("Activity")}>
          {groups.length === 0 ? (
            <p className="bf-muted eh-empty">
              {data.activity.length === 0
                ? t("No activity yet. Changes to this event, its tickets and orders will appear here.")
                : t("No activity matches these filters.")}
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
