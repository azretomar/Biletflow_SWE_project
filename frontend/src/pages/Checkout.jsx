import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { isNotConnected } from "../lib/useApi";
import "./checkout.css";

// Checkout with simulated KZT payment (SRS 3.2, 4.6). No real money and no card
// data: the attendee only chooses whether the test payment succeeds or fails.
//
// Backend:
//   GET  /api/events/{id}            event and its ticket types (paid_sales says if paid tickets are on sale)
//   POST /api/events/{id}/register   free tickets (one ticket type per call)
//   POST /api/promo/validate   { event_id, code } -> { code, discount_type, amount }
//   POST /api/orders/checkout  { event_id, items: [{ ticket_type_id, quantity }],
//                                promo_code, simulate: "success" | "failure" }
//        -> { order_id, status: "paid" | "free" | "failed", subtotal, discount, total, tickets }
// The server, not this page, calculates prices and discounts; the numbers here are a preview.

const MAX_PER_TYPE = 10;

function kzt(n) {
  return n === 0 ? "Free" : n.toLocaleString("en-US") + " ₸";
}

function notConnected(err) {
  return isNotConnected(err);
}

function Checkout() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();

  const [event, setEvent] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [quantities, setQuantities] = useState((location.state && location.state.quantities) || {});
  const initialPromo = (location.state && location.state.promo) || "";
  const [promo, setPromo] = useState(initialPromo);
  const [discount, setDiscount] = useState(null); // { code, discount_type, amount }
  const [promoMessage, setPromoMessage] = useState("");
  const [simulate, setSimulate] = useState("success");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { order_ids, tickets }

  useEffect(() => {
    let active = true;
    api(`/events/${id}`)
      .then((data) => active && setEvent(data))
      .catch((err) => active && setLoadError(err.message));
    return () => {
      active = false;
    };
  }, [id]);

  // A campaign QR brings its code along: check it once, as if "Apply" was pressed.
  useEffect(() => {
    if (!initialPromo || !user) return undefined;
    let active = true;
    api("/promo/validate", { method: "POST", body: { event_id: id, code: initialPromo } })
      .then((data) => {
        if (!active) return;
        setDiscount(data);
        setPromoMessage(`Code ${data.code} applied.`);
      })
      .catch((err) => active && setPromoMessage(err.message));
    return () => {
      active = false;
    };
  }, [id, initialPromo, user]);

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const types = (event && event.ticket_types) || [];
  // Paid tickets are sold only after the organizer finished the paid-sales checklist (SRS 3.2).
  const paidOnSale = Boolean(event && event.paid_sales === "active");
  const closedNote =
    event && event.status === "cancelled" ? "This event was cancelled."
      : event && event.suspended ? "Ticket sales for this event are paused by BiletFlow."
        : event && event.status === "draft" ? "This event is not published yet."
          : "";
  const lines = types
    .map((t) => ({ type: t, qty: Number(quantities[t.id]) || 0 }))
    .filter((l) => l.qty > 0);
  const subtotal = lines.reduce((sum, l) => sum + l.type.price * l.qty, 0);
  let discountAmount = 0;
  if (discount) {
    discountAmount =
      discount.discount_type === "percent" ? Math.round((subtotal * discount.amount) / 100) : discount.amount;
    discountAmount = Math.min(discountAmount, subtotal);
  }
  const total = subtotal - discountAmount;
  const isFree = lines.length > 0 && subtotal === 0;

  function setQty(typeId, value, max) {
    const n = Math.max(0, Math.min(Number(value) || 0, max));
    setQuantities({ ...quantities, [typeId]: n });
  }

  async function applyPromo() {
    setPromoMessage("");
    setDiscount(null);
    if (!promo.trim()) return;
    try {
      const data = await api("/promo/validate", { method: "POST", body: { event_id: id, code: promo.trim() } });
      setDiscount(data);
      setPromoMessage(`Code ${data.code} applied.`);
    } catch (err) {
      setPromoMessage(notConnected(err) ? "Promo codes are not connected to the server yet." : err.message);
    }
  }

  async function pay(e) {
    e.preventDefault();
    setError("");
    if (lines.length === 0) {
      setError("Choose at least one ticket.");
      return;
    }
    setBusy(true);
    try {
      if (isFree) {
        // Free tickets: the backend already supports this, one ticket type per call.
        const orders = [];
        for (const l of lines) {
          orders.push(await api(`/events/${id}/register`, {
            method: "POST",
            body: { ticket_type_id: l.type.id, quantity: l.qty },
          }));
        }
        setResult({ order_ids: orders.map((o) => o.order_id), tickets: orders.flatMap((o) => o.tickets) });
      } else {
        const data = await api("/orders/checkout", {
          method: "POST",
          body: {
            event_id: id,
            items: lines.map((l) => ({ ticket_type_id: l.type.id, quantity: l.qty })),
            promo_code: discount ? discount.code : "",
            simulate,
          },
        });
        if (data.status === "failed") {
          setError("The test payment failed. No tickets were issued. You can try again.");
        } else {
          setResult({ order_ids: [data.order_id], tickets: data.tickets || [] });
        }
      }
    } catch (err) {
      setError(
        notConnected(err) ? "Paid checkout is not connected to the server yet. Free tickets already work." : err.message
      );
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="co">
        <Navbar />
        <main className="bf-page co-page">
          <section className="bf-card co-done" aria-live="polite">
            <h1 className="bf-title">You're going!</h1>
            <p className="bf-muted">
              {event.title} · {result.tickets.length} ticket{result.tickets.length === 1 ? "" : "s"} · order{" "}
              {result.order_ids.join(", ")}
            </p>
            <ul className="co-ticket-list">
              {result.tickets.map((t, i) => (
                <li key={t.id}>
                  <span>Ticket {i + 1}</span>
                  <Link to={`/tickets/${t.id}`}>View</Link>
                  <Link to={`/tickets/${t.id}/print`}>Print / PDF</Link>
                </li>
              ))}
            </ul>
            <div className="co-done-actions">
              <Link to="/my-tickets" className="bf-btn">Go to My tickets</Link>
              <Link to="/my-orders" className="bf-btn-outline">My orders</Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="co">
      <Navbar />
      <main className="bf-page co-page">
        <Link to={`/events/${id}`} className="bf-back">&lt;Back to event</Link>
        <h1 className="bf-title">Checkout</h1>
        <p className="bf-muted co-sub">{event ? event.title : loadError ? "" : "Loading event..."}</p>
        {loadError && <p className="co-error" role="alert">{loadError}</p>}

        {closedNote && <p className="co-error" role="alert">{closedNote}</p>}
        {event && !closedNote && (
          <form className="co-grid" onSubmit={pay}>
            <div className="co-main">
              <section className="bf-card co-card">
                <h2>Tickets</h2>
                {types.length === 0 ? (
                  <p className="bf-muted">This event has no tickets yet.</p>
                ) : (
                  <ul className="co-types">
                    {types.map((t) => {
                      const onSale = t.price === 0 || paidOnSale;
                      const max = onSale ? Math.min(MAX_PER_TYPE, t.quantity_left) : 0;
                      return (
                        <li key={t.id} className="co-type">
                          <div>
                            <strong>{t.name}</strong>
                            {t.description && <span className="bf-muted co-type-desc">{t.description}</span>}
                            <span className="bf-muted co-type-left">
                              {!onSale ? "On sale soon" : t.quantity_left > 0 ? `${t.quantity_left} left` : "Sold out"}
                            </span>
                          </div>
                          <span className="co-price">{kzt(t.price)}</span>
                          <label className="co-qty">
                            <span className="bf-sr-only">Quantity of {t.name}</span>
                            <input
                              type="number"
                              min="0"
                              max={max}
                              className="bf-input"
                              value={quantities[t.id] || 0}
                              disabled={max === 0}
                              onChange={(e) => setQty(t.id, e.target.value, max)}
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {!isFree && (
                <section className="bf-card co-card">
                  <h2>Payment</h2>
                  <p className="co-test-note">
                    Test mode: this is a simulated payment in KZT. No card is needed and no money is charged.
                  </p>
                  <fieldset className="co-sim">
                    <legend className="bf-label">Simulate the result</legend>
                    <label>
                      <input
                        type="radio"
                        name="simulate"
                        value="success"
                        checked={simulate === "success"}
                        onChange={() => setSimulate("success")}
                      />{" "}
                      Payment succeeds
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="simulate"
                        value="failure"
                        checked={simulate === "failure"}
                        onChange={() => setSimulate("failure")}
                      />{" "}
                      Payment fails (to test the error)
                    </label>
                  </fieldset>
                </section>
              )}
            </div>

            <aside className="bf-card co-card co-summary">
              <h2>Order summary</h2>
              {lines.length === 0 ? (
                <p className="bf-muted">No tickets chosen yet.</p>
              ) : (
                <ul className="co-lines">
                  {lines.map((l) => (
                    <li key={l.type.id}>
                      <span>
                        {l.qty} × {l.type.name}
                      </span>
                      <span>{kzt(l.type.price * l.qty)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {!isFree && (
                <div className="co-promo">
                  <label className="bf-label" htmlFor="co-promo">Promo code</label>
                  <div className="co-promo-row">
                    <input
                      id="co-promo"
                      className="bf-input"
                      value={promo}
                      onChange={(e) => setPromo(e.target.value.toUpperCase())}
                      placeholder="e.g. STUDENT-7K2Q"
                    />
                    <button type="button" className="bf-btn-outline" onClick={applyPromo}>Apply</button>
                  </div>
                  {promoMessage && <p className="bf-muted co-promo-msg" aria-live="polite">{promoMessage}</p>}
                </div>
              )}

              <dl className="co-totals">
                <dt>Subtotal</dt>
                <dd>{kzt(subtotal)}</dd>
                {discountAmount > 0 && (
                  <>
                    <dt>Discount</dt>
                    <dd>− {kzt(discountAmount)}</dd>
                  </>
                )}
                <dt className="co-total">Total</dt>
                <dd className="co-total">{kzt(total)}</dd>
              </dl>

              {error && <p className="co-error" role="alert">{error}</p>}
              <button type="submit" className="bf-btn bf-btn-block" disabled={busy || lines.length === 0}>
                {busy
                  ? "Please wait..."
                  : lines.length === 0
                    ? "Choose tickets"
                    : isFree
                      ? "Get free tickets"
                      : total === 0
                        ? "Confirm order (test)"
                        : `Pay ${kzt(total)} (test)`}
              </button>
            </aside>
          </form>
        )}
      </main>
    </div>
  );
}

export default Checkout;
