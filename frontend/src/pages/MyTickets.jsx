import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import EventImage from "../components/EventImage";
import { useApi, statusNote } from "../lib/useApi";
import { shortDateTime } from "../lib/format";
import "./myTickets.css";
import { t } from "../i18n";

const FILTERS = [
  { value: "all", get label() { return t("All"); } },
  { value: "valid", get label() { return t("Valid"); } },
  { value: "checked_in", get label() { return t("Checked in"); } },
  { value: "cancelled", get label() { return t("Cancelled"); } },
  { value: "refunded", get label() { return t("Refunded"); } },
];

const STATUS_LABELS = {
  get valid() { return t("Valid"); },
  get checked_in() { return t("Checked in"); },
  get cancelled() { return t("Cancelled"); },
  get refunded() { return t("Refunded"); },
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

  const visible = filter === "all" ? tickets : tickets.filter((tt) => tt.status === filter);

  return (
    <div className="mt">
      <Navbar />

      <main className="bf-page">
        <h1 className="bf-title">{t("My tickets")}</h1>

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
          <p className="bf-muted">{t("Loading your tickets...")}</p>
        ) : status !== "ready" ? (
          <div className="mt-empty" role="alert">
            <p>{statusNote(status, error)}</p>
            <button type="button" className="bf-btn-outline" onClick={reload}>{t("Try again")}</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-empty">
            <p>
              {tickets.length === 0 ? t("No tickets yet.") : t("No tickets with this status.")}{" "}
              <Link to="/events">{t("Find an event")}</Link>
            </p>
          </div>
        ) : (
          <div className="mt-list">
            {visible.map((tt) => (
              <article key={tt.id} className="bf-card mt-row">
                <EventImage src={tt.event.image_url} className="mt-img" />
                <div className="mt-info">
                  <h3>{tt.event.title}</h3>
                  <p>{shortDateTime(tt.event.date)}{tt.event.venue ? ` · ${tt.event.venue}` : ""}</p>
                  <p className="mt-type">{tt.ticket_type.name}</p>
                </div>
                <div className="mt-side">
                  <span className={`bf-badge ${STATUS_CLASSES[tt.status]}`}>
                    {STATUS_LABELS[tt.status]}
                  </span>
                  <Link to={`/tickets/${tt.id}`}>{t("View ticket")} &gt;</Link>
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