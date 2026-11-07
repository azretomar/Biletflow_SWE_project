import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./registration.css";

function Registration() {
  const { id } = useParams();
  const location = useLocation();

  // The event and its ticket types will come from the backend: GET /api/events/:id
  const event = null;
  const ticketTypes = [];

  // Quantities chosen on the Event detail page arrive through the link.
  const chosen = (location.state && location.state.quantities) || {};
  const firstChosen = ticketTypes.find((t) => chosen[t.id] > 0);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    ticket_type_id: firstChosen ? String(firstChosen.id) : "",
    quantity: firstChosen ? chosen[firstChosen.id] : 1,
    promo_code: "",
  });

  const selected = ticketTypes.find((t) => String(t.id) === form.ticket_type_id);
  const maxQuantity = selected ? Math.min(10, selected.quantity_left) : 1;
  const subtotal = selected ? selected.price * form.quantity : 0;
  // The discount will come from the backend when a promo code is applied.
  const discount = 0;
  const total = subtotal - discount;

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleApply() {
    // TODO: validate the promo code with the backend.
  }

  function handleSubmit(e) {
    e.preventDefault();
    // TODO: POST /api/events/:id/register when the backend is connected.
    console.log("Registering:", form);
  }

  return (
    <div className="rg">
      <Navbar />

      <main className="bf-page">
        <Link to={`/events/${id}`} className="bf-back">&lt;Back to Event</Link>

        <form className="rg-grid" onSubmit={handleSubmit}>
          <section>
            <h1 className="rg-title">{event ? event.title : "Event name"}</h1>
            <p className="bf-muted rg-sub">
              {event ? `${event.date} | ${event.venue}` : "Date | Venue"}
            </p>

            <h2>Your details</h2>
            <label className="bf-label" htmlFor="full_name">Full name</label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              className="bf-input"
              value={form.full_name}
              onChange={handleChange}
            />
            <label className="bf-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="bf-input"
              value={form.email}
              onChange={handleChange}
            />

            <h2 className="rg-section">Tickets</h2>
            <div className="rg-row">
              <div>
                <label className="bf-label" htmlFor="ticket_type_id">Ticket type</label>
                <select
                  id="ticket_type_id"
                  name="ticket_type_id"
                  className="bf-input"
                  value={form.ticket_type_id}
                  onChange={handleChange}
                >
                  {ticketTypes.length === 0 && <option value="">No ticket types</option>}
                  {ticketTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.price === 0 ? "Free" : `${t.price} KZT`})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="bf-label" htmlFor="quantity">Quantity</label>
                <select
                  id="quantity"
                  name="quantity"
                  className="bf-input"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                >
                  {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="bf-label" htmlFor="promo_code">Promo code</label>
            <div className="rg-promo">
              <input
                id="promo_code"
                name="promo_code"
                type="text"
                className="bf-input"
                value={form.promo_code}
                onChange={handleChange}
              />
              <button type="button" className="bf-btn-outline" onClick={handleApply}>
                Apply
              </button>
            </div>
          </section>

          <aside className="bf-panel rg-summary">
            <h2>Order summary</h2>
            <h3>{event ? event.title : "Event name"}</h3>

            <div className="rg-line">
              <span>{selected ? `${selected.name} x ${form.quantity}` : "-"}</span>
              <span>{subtotal} KZT</span>
            </div>
            <div className="rg-line">
              <span>Discount:</span>
              <span>-{discount} KZT</span>
            </div>
            <div className="rg-line rg-total">
              <span>Total</span>
              <span>{total} KZT</span>
            </div>

            <button type="submit" className="bf-btn bf-btn-block">Confirm and pay</button>
          </aside>
        </form>
      </main>
    </div>
  );
}

export default Registration;