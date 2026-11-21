import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useApi, statusNote } from "../lib/useApi";
import { kzt, shortDateTime, ORDER_STATUS } from "../lib/format";
import "./orders.css";

// Attendee's orders (SRS 4.9). One order = one checkout, with one or more tickets.
// Backend (docs/api.md): GET /api/my-orders ->
// [{ id, created_at, status: "paid" | "free" | "failed" | "cancelled" | "refunded",
//    total, event: { id, title, date }, items: [{ ticket_type, quantity, price }],
//    tickets: [{ id, status }] }]
function MyOrders() {
  const { data: orders, status, error } = useApi("/my-orders", []);
  const note = statusNote(status, error);

  return (
    <div className="ord">
      <Navbar />
      <main className="bf-page">
        <h1 className="bf-title">My orders</h1>
        <p className="bf-muted ord-sub">
          Every registration or purchase you made. Tickets themselves are in <Link to="/my-tickets">My tickets</Link>.
        </p>
        {note && <p className="bf-muted ord-note" role="status">{note}</p>}

        {orders.length === 0 ? (
          <section className="bf-card ord-empty">
            <p className="bf-muted">No orders yet.</p>
            <Link to="/events" className="bf-btn">Find events</Link>
          </section>
        ) : (
          <ul className="ord-list">
            {orders.map((o) => {
              const s = ORDER_STATUS[o.status] || { label: o.status, badge: "" };
              return (
                <li key={o.id} className="bf-card ord-card">
                  <div className="ord-card-head">
                    <div>
                      <Link to={`/events/${o.event.id}`} className="ord-event">{o.event.title}</Link>
                      <span className="bf-muted ord-meta">
                        {shortDateTime(o.event.date)} · Order {o.id} · {shortDateTime(o.created_at)}
                      </span>
                    </div>
                    <span className={`bf-badge ${s.badge}`}>{s.label}</span>
                  </div>
                  <ul className="ord-items">
                    {o.items.map((it) => (
                      <li key={it.ticket_type}>
                        <span>{it.quantity} × {it.ticket_type}</span>
                        <span>{kzt(it.price * it.quantity)}</span>
                      </li>
                    ))}
                    <li className="ord-total">
                      <span>Total</span>
                      <span>{kzt(o.total)}</span>
                    </li>
                  </ul>
                  <div className="ord-actions">
                    {o.tickets.length > 0 && (
                      <Link to={`/tickets/${o.tickets[0].id}`} className="bf-btn-outline">
                        View ticket{o.tickets.length > 1 ? "s" : ""}
                      </Link>
                    )}
                    <Link to={`/support/new?order=${o.id}`} className="ord-help">Need help with this order?</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default MyOrders;
