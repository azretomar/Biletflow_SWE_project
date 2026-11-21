import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import EventImage from "../components/EventImage";
import { useApi, statusNote } from "../lib/useApi";
import { kzt, shortDateTime } from "../lib/format";
import "./eventDetail.css";

const MAX_PER_TYPE = 10;

// Public event page: GET /api/events/{id}. Chosen quantities go on to Checkout,
// which handles free registration, simulated payment and promo codes in one place.
function EventDetail() {
  const { id } = useParams();
  const { data: event, status, error, code, reload } = useApi(`/events/${id}`, null);
  // a missing endpoint, an unknown id or a malformed id all mean "no such event" here
  const notFound = status === "not_connected" || code === 404 || code === 400;
  const [quantities, setQuantities] = useState({});

  const ticketTypes = (event && event.ticket_types) || [];
  const now = new Date();
  const ended = event && new Date(event.date) < now;
  const closed = event && event.registration_closes_at && new Date(event.registration_closes_at) < now;
  const chosen = Object.values(quantities).reduce((s, n) => s + n, 0);

  function changeQuantity(typeId, delta, left) {
    const current = quantities[typeId] || 0;
    const next = Math.min(Math.max(current + delta, 0), Math.min(left, MAX_PER_TYPE));
    setQuantities({ ...quantities, [typeId]: next });
  }

  if (status !== "ready" || !event) {
    return (
      <div className="ed">
        <Navbar />
        <main className="bf-page">
          <Link to="/events" className="bf-back">&lt;Back to Events</Link>
          {status === "loading" ? (
            <p className="bf-muted">Loading event...</p>
          ) : (
            <div role="alert">
              <h1 className="ed-title">{notFound ? "Event not found" : "Could not load this event"}</h1>
              {!notFound && status === "error" && (
                <>
                  <p className="bf-muted">{statusNote(status, error)}</p>
                  <button type="button" className="bf-btn-outline" onClick={reload}>Try again</button>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  const details = [
    ["Date", shortDateTime(event.date)],
    ["Venue", event.venue || "-"],
    ["Organizer", event.organizer_name || "-"],
  ];

  let blocked = "";
  if (ended) blocked = "This event has already taken place.";
  else if (closed) blocked = "Registration for this event is closed.";
  else if (ticketTypes.length === 0) blocked = "Tickets are not available yet.";

  return (
    <div className="ed">
      <Navbar />

      <main className="bf-page">
        <Link to="/events" className="bf-back">&lt;Back to Events</Link>

        <div className="ed-grid">
          <section>
            <EventImage src={event.image_url} className="ed-img" />
            <span className="bf-category">{event.category}</span>
            <h1 className="ed-title">{event.title}</h1>

            <dl className="ed-details">
              {details.map(([label, value]) => (
                <div key={label} className="ed-detail">
                  <dt className="bf-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <h2 className="ed-about">About this event</h2>
            <p className="bf-muted ed-description">{event.description || "No description."}</p>
          </section>

          <aside className="bf-panel ed-tickets">
            <h2>Tickets</h2>

            {ticketTypes.length === 0 ? (
              <p className="bf-muted">No ticket types available yet.</p>
            ) : (
              ticketTypes.map((t) => (
                <div key={t.id} className="bf-card ed-type">
                  <h3>{t.name}</h3>
                  {t.description && <p className="bf-muted ed-type-desc">{t.description}</p>}
                  <div className="ed-type-row">
                    <div>
                      <div className="ed-price">{kzt(t.price)}</div>
                      <div className="bf-muted ed-left">{t.quantity_left > 0 ? `${t.quantity_left} left` : "Sold out"}</div>
                    </div>
                    {!blocked && t.quantity_left > 0 && (
                      <div className="ed-stepper">
                        <button type="button" aria-label={`One less ${t.name} ticket`}
                          onClick={() => changeQuantity(t.id, -1, t.quantity_left)}>-</button>
                        <span aria-live="polite" aria-label={`${quantities[t.id] || 0} ${t.name} tickets`}>
                          {quantities[t.id] || 0}
                        </span>
                        <button type="button" aria-label={`One more ${t.name} ticket`}
                          onClick={() => changeQuantity(t.id, 1, t.quantity_left)}>+</button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {event.registration_closes_at && !ended && (
              <p className="bf-muted ed-closes">Registration open until {shortDateTime(event.registration_closes_at)}</p>
            )}
            {blocked ? (
              <p className="ed-blocked">{blocked}</p>
            ) : (
              <Link to={`/events/${id}/checkout`} state={{ quantities }} className="bf-btn bf-btn-block">
                {chosen > 0 ? `Continue with ${chosen} ticket${chosen === 1 ? "" : "s"}` : "Get tickets"}
              </Link>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

export default EventDetail;
