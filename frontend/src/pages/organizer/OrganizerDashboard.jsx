import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import EventImage from "../../components/EventImage";
import { useApi, statusNote } from "../../lib/useApi";
import { shortDateTime } from "../../lib/format";
import "./organizerDashboard.css";
import { t } from "../../i18n";

// The organizer's own events (SRS 4.16: upcoming, active, completed, cancelled).
// GET /api/organizer/events (backend/organizer.go) ->
//   [{ id, title, date, venue, capacity, sold, image_url, ... }]; status "cancelled" comes later.
// Upcoming / active / completed are worked out from the date when the server does not send them.

const FILTERS = [
  { value: "all", get label() { return t("All"); } },
  { value: "draft", get label() { return t("Drafts"); } },
  { value: "upcoming", get label() { return t("Upcoming"); } },
  { value: "active", get label() { return t("Active"); } },
  { value: "completed", get label() { return t("Completed"); } },
  { value: "cancelled", get label() { return t("Cancelled"); } },
];

const STATUS_LABELS = {
  get draft() { return t("Draft"); },
  get upcoming() { return t("Upcoming"); },
  get active() { return t("Active"); },
  get completed() { return t("Completed"); },
  get cancelled() { return t("Cancelled"); },
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
        <h1 className="bf-title">{t("Organizer dashboard")}</h1>

        <div className="dash-toolbar">
          <div className="bf-chips dash-chips" role="group" aria-label={t("Filter events")}>
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
            <Link to="/organizer/profile" className="bf-btn-outline">{t("Profile")}</Link>
            <Link to="/organizer/promo" className="bf-btn-outline">{t("Promo campaigns")}</Link>
            <Link to="/organizer/support" className="bf-btn-outline">{t("Support inbox")}</Link>
            <Link to="/create-event" className="bf-btn">{t("Create event")}</Link>
          </div>
        </div>

        {note && <p className="bf-muted dash-note" role="status">{note}</p>}

        {visible.length === 0 ? (
          <div className="dash-empty">
            <p>
              {events.length === 0
                ? t("No events yet. Create your first event to get started.")
                : t("No events in this group.")}
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
                  <p className="dash-sold">{t("{sold} / {capacity} sold", { sold: ev.sold ?? 0, capacity: ev.capacity })}</p>
                </div>
                <div className="dash-side">
                  <span className={`bf-badge bf-badge-${ev.status}`}>{STATUS_LABELS[ev.status]}</span>
                  <div className="dash-links">
                    {(ev.status === "upcoming" || ev.status === "draft") && (
                      <Link to={`/organizer/events/${ev.id}/edit`}>{t("Edit")}&gt;</Link>
                    )}
                    {(ev.status === "completed" || ev.status === "cancelled") && (
                      <Link to={`/organizer/events/${ev.id}/history`}>{t("Duplicate")}&gt;</Link>
                    )}
                    <Link to={`/organizer/events/${ev.id}`}>{t("Manage")}&gt;</Link>
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
