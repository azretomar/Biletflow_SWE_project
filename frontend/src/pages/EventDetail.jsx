import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./eventDetail.css";

function EventDetail() {
  const { id } = useParams();

  // The event and its ticket types will come from the backend: GET /api/events/:id
  const event = null;
  const ticketTypes = [];

  const [quantities, setQuantities] = useState({});

  function changeQuantity(typeId, delta, max) {
    const current = quantities[typeId] || 0;
    const next = Math.min(Math.max(current + delta, 0), max);
    setQuantities({ ...quantities, [typeId]: next });
  }

  const details = [
    ["Date", event ? event.date : "-"],
    ["Venue", event ? event.venue : "-"],
    ["Organizer", event ? event.organizer_name : "-"],
  ];

  return (
    <div className="ed">
      <Navbar />

      <main className="bf-page">
        <Link to="/events" className="bf-back">&lt;Back to Events</Link>

        <div className="ed-grid">
          <section>
            <div className="bf-img ed-img">Event image</div>
            <span className="bf-category">{event ? event.category : "Category"}</span>
            <h1 className="ed-title">{event ? event.title : "Event name"}</h1>

            <dl className="ed-details">
              {details.map(([label, value]) => (
                <div key={label} className="ed-detail">
                  <dt className="bf-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <h2 className="ed-about">About this event</h2>
            <p className="bf-muted">{event ? event.description : "Description of the event"}</p>
          </section>

          <aside className="bf-panel ed-tickets">
            <h2>Tickets</h2>

            {ticketTypes.length === 0 ? (
              <p className="bf-muted">No ticket types available yet.</p>
            ) : (
              ticketTypes.map((t) => (
                <div key={t.id} className="bf-card ed-type">
                  <h3>{t.name}</h3>
                  <div className="ed-type-row">
                    <div>
                      <div className="ed-price">{t.price === 0 ? "Free" : `${t.price} KZT`}</div>
                      <div className="bf-muted ed-left">{t.quantity_left} Left</div>
                    </div>
                    <div className="ed-stepper">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => changeQuantity(t.id, -1, t.quantity_left)}
                      >
                        -
                      </button>
                      <span>{quantities[t.id] || 0}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => changeQuantity(t.id, 1, t.quantity_left)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}

            <p className="bf-muted ed-closes">
              {event ? `Registration open until ${event.registration_closes_at}` : "Registration open until -"}
            </p>
            <Link
              to={`/events/${id}/register`}
              state={{ quantities }}
              className="bf-btn bf-btn-block"
            >
              Register
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default EventDetail;