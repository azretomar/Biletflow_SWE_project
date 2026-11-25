import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import EventImage from "../components/EventImage";
import { useAuth } from "../AuthContext";
import { useApi, send, statusNote } from "../lib/useApi";
import { kzt, shortDateTime } from "../lib/format";
import "./eventDetail.css";
import { t } from "../i18n";
import { categoryName, maxPerOrder, saleNote } from "../lib/events";

const MAX_PER_TYPE = 10;

// Public event page: GET /api/events/{id}. Chosen quantities go on to Checkout,
// which handles free registration, simulated payment and promo codes in one place.
// A campaign QR opens this page with ?promo=CODE; the code is passed on to Checkout.
function EventDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const promo = params.get("promo") || "";
  const { user } = useAuth();
  const { data: event, status, error, code, reload } = useApi(`/events/${id}`, null);
  // a missing endpoint, an unknown id or a malformed id all mean "no such event" here
  const notFound = status === "not_connected" || code === 404 || code === 400;
  const [quantities, setQuantities] = useState({});

  const ticketTypes = (event && event.ticket_types) || [];
  const now = new Date();
  const ended = event && new Date(event.date) < now;
  const closed = event && event.registration_closes_at && new Date(event.registration_closes_at) < now;
  const notOpenYet = event && event.registration_opens_at && new Date(event.registration_opens_at) > now;
  // Paid tickets are sold only after the organizer finished the paid-sales checklist (SRS 3.2).
  const paidOnSale = Boolean(event && event.paid_sales === "active");
  const chosen = Object.values(quantities).reduce((s, n) => s + n, 0);

  function changeQuantity(tt, delta) {
    const current = quantities[tt.id] || 0;
    const next = Math.min(Math.max(current + delta, 0), maxPerOrder(tt, MAX_PER_TYPE));
    setQuantities({ ...quantities, [tt.id]: next });
  }

  if (status !== "ready" || !event) {
    return (
      <div className="ed">
        <Navbar />
        <main className="bf-page">
          <Link to="/events" className="bf-back">&lt;{t("Back to Events")}</Link>
          {status === "loading" ? (
            <p className="bf-muted">{t("Loading event...")}</p>
          ) : (
            <div role="alert">
              <h1 className="ed-title">{notFound ? t("Event not found") : t("Could not load this event")}</h1>
              {!notFound && status === "error" && (
                <>
                  <p className="bf-muted">{statusNote(status, error)}</p>
                  <button type="button" className="bf-btn-outline" onClick={reload}>{t("Try again")}</button>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  const details = [
    [t("Date"), shortDateTime(event.date) + (event.ends_at ? ` - ${shortDateTime(event.ends_at)}` : "")],
    [t("Venue"), [event.venue, event.venue_address].filter(Boolean).join(", ") || "-"],
    [t("Organizer"), event.organizer_name || "-"],
  ];

  let blocked = "";
  if (event.status === "cancelled") blocked = t("This event was cancelled. Tickets are refunded or cancelled automatically.");
  else if (event.suspended) blocked = t("Ticket sales for this event are paused by BiletFlow.");
  else if (event.status === "draft") blocked = t("This is a draft. Publish it to start selling tickets.");
  else if (ended) blocked = t("This event has already taken place.");
  else if (closed) blocked = t("Registration for this event is closed.");
  else if (notOpenYet) blocked = t("Registration opens {date}.", { date: shortDateTime(event.registration_opens_at) });
  else if (ticketTypes.length === 0) blocked = t("Tickets are not available yet.");
  else if (!paidOnSale && ticketTypes.every((tt) => tt.price > 0)) blocked = t("Paid tickets go on sale soon.");

  const isOwner = user && user.id === event.organizer_id;

  return (
    <div className="ed">
      <Navbar />

      <main className="bf-page">
        <Link to="/events" className="bf-back">&lt;{t("Back to Events")}</Link>

        <div className="ed-grid">
          <section>
            <EventImage src={event.image_url} className="ed-img" />
            <span className="bf-category">{categoryName(event.category)}</span>
            <h1 className="ed-title">{event.title}</h1>

            <dl className="ed-details">
              {details.map(([label, value]) => (
                <div key={label} className="ed-detail">
                  <dt className="bf-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <h2 className="ed-about">{t("About this event")}</h2>
            <p className="bf-muted ed-description">{event.description || t("No description.")}</p>
            {user && !isOwner && (
              <p className="ed-help">
                {t("Questions about this event?")} <Link to={`/support/new?event=${id}`}>{t("Contact support")}</Link>
              </p>
            )}
            {user && !isOwner && <ReportEvent eventId={id} />}
          </section>

          <aside className="bf-panel ed-tickets">
            <h2>{t("Tickets")}</h2>

            {ticketTypes.length === 0 ? (
              <p className="bf-muted">{t("No ticket types available yet.")}</p>
            ) : (
              ticketTypes.map((tt) => {
                // Only the organizer (and admins) get hidden types back from the server.
                const note = tt.hidden ? t("Hidden from attendees") : saleNote(tt);
                const canPick = !blocked && !note && tt.quantity_left > 0 && (tt.price === 0 || paidOnSale);
                return (
                <div key={tt.id} className="bf-card ed-type">
                  <h3>{tt.name}</h3>
                  {tt.description && <p className="bf-muted ed-type-desc">{tt.description}</p>}
                  <div className="ed-type-row">
                    <div>
                      <div className="ed-price">{kzt(tt.price)}</div>
                      <div className="bf-muted ed-left">{tt.quantity_left > 0 ? t("{n} left", { n: tt.quantity_left }) : t("Sold out")}</div>
                      {tt.max_per_order && (
                        <div className="bf-muted ed-left">{t("Up to {n} per order", { n: tt.max_per_order })}</div>
                      )}
                    </div>
                    {!blocked && note && <span className="bf-muted ed-left">{note}</span>}
                    {!blocked && !note && tt.price > 0 && !paidOnSale && <span className="bf-muted ed-left">{t("On sale soon")}</span>}
                    {canPick && (
                      <div className="ed-stepper">
                        <button type="button" aria-label={t("One less {name} ticket", { name: tt.name })}
                          onClick={() => changeQuantity(tt, -1)}>-</button>
                        <span aria-live="polite" aria-label={t("{name} tickets: {n}", { name: tt.name, n: quantities[tt.id] || 0 })}>
                          {quantities[tt.id] || 0}
                        </span>
                        <button type="button" aria-label={t("One more {name} ticket", { name: tt.name })}
                          onClick={() => changeQuantity(tt, 1)}>+</button>
                      </div>
                    )}
                  </div>
                </div>
                );
              })
            )}

            {event.registration_closes_at && !ended && (
              <p className="bf-muted ed-closes">{t("Registration open until {date}", { date: shortDateTime(event.registration_closes_at) })}</p>
            )}
            {blocked ? (
              <p className="ed-blocked">{blocked}</p>
            ) : (
              <Link to={`/events/${id}/checkout`} state={{ quantities, promo }} className="bf-btn bf-btn-block">
                {chosen > 0 ? t("Continue with {n} tickets", { n: chosen }) : t("Get tickets")}
              </Link>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

// "Report this event" for logged-in visitors (SRS 4.12); platform admins review reports.
function ReportEvent({ eventId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setMessage(t("Tell us briefly what is wrong (at least 5 characters)."));
      return;
    }
    setBusy(true);
    const r = await send(`/events/${eventId}/report`, "POST", { reason: reason.trim() });
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      setReason("");
      setMessage(t("Thank you. Our team will review this event."));
    } else {
      setMessage(r.message);
    }
  }

  if (!open) {
    return (
      <p className="ed-report">
        <button type="button" className="ed-report-link" onClick={() => { setOpen(true); setMessage(""); }}>
          {t("Report this event")}
        </button>
        {message && <span className="bf-muted" role="status"> {message}</span>}
      </p>
    );
  }
  return (
    <form className="bf-card ed-report-form" onSubmit={submit}>
      <label className="bf-label" htmlFor="ed-report-reason">{t("What is wrong with this event?")}</label>
      <textarea id="ed-report-reason" className="bf-input" rows={3} maxLength={500} value={reason}
        onChange={(e) => setReason(e.target.value)} placeholder={t("For example: fake event, wrong venue, offensive content")} />
      {message && <p className="ed-report-msg" role="alert">{message}</p>}
      <div className="ed-report-actions">
        <button type="button" className="bf-btn-outline" onClick={() => setOpen(false)}>{t("Cancel")}</button>
        <button type="submit" className="bf-btn" disabled={busy}>{busy ? t("Sending...") : t("Send report")}</button>
      </div>
    </form>
  );
}

export default EventDetail;
