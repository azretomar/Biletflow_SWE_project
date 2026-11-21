import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useApi, send, statusNote } from "../../lib/useApi";
import { kzt, shortDateTime, ORDER_STATUS } from "../../lib/format";
import "../orders.css";

// Organizer: orders of one event, refund policy, cancellations and refunds (SRS 4.9).
// Backend (docs/api.md):
//   GET  /api/organizer/events/{id}/orders  -> [{ id, created_at, status, total,
//          attendee: { full_name, email }, items: [{ ticket_type, quantity, price }] }]
//   GET  /api/organizer/events/{id}/refund-policy -> { policy }
//   PUT  /api/organizer/events/{id}/refund-policy    { policy }
//   POST /api/organizer/orders/{orderId}/cancel   { reason }   free registrations only
//   POST /api/organizer/orders/{orderId}/refund   { reason }   full refund of a paid order
// Cancelled or refunded tickets become invalid; the server records every action in the audit log.

const FILTERS = [
  { value: "", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "free", label: "Free" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function EventOrders() {
  const { id } = useParams();
  const { data: orders, setData: setOrders, status, error } = useApi(`/organizer/events/${id}/orders`, []);
  const policyReq = useApi(`/organizer/events/${id}/refund-policy`, { policy: "" });
  const [policy, setPolicy] = useState(null); // null = not edited yet
  const [policyMsg, setPolicyMsg] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [confirming, setConfirming] = useState(null); // { order, action: "cancel" | "refund" }
  const [actionMsg, setActionMsg] = useState("");

  const policyText = policy ?? policyReq.data.policy ?? "";

  const visible = orders.filter((o) => {
    const text = (o.id + " " + o.attendee.full_name + " " + o.attendee.email).toLowerCase();
    return (!filter || o.status === filter) && (!search || text.includes(search.toLowerCase()));
  });

  async function savePolicy(e) {
    e.preventDefault();
    const r = await send(`/organizer/events/${id}/refund-policy`, "PUT", { policy: policyText });
    setPolicyMsg(r.ok ? "Refund policy saved." : r.message);
  }

  async function runAction(reason) {
    const { order, action } = confirming;
    const r = await send(`/organizer/orders/${order.id}/${action}`, "POST", { reason });
    if (r.ok) {
      const newStatus = action === "refund" ? "refunded" : "cancelled";
      setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
      setActionMsg(`Order ${order.id} ${newStatus}. Its tickets are no longer valid.`);
    } else {
      setActionMsg(r.message);
    }
    setConfirming(null);
  }

  const note = statusNote(status, error);

  return (
    <div className="ord">
      <Navbar />
      <main className="bf-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;Back to Event management</Link>
        <h1 className="bf-title">Orders and refunds</h1>

        <form className="bf-card ord-policy" onSubmit={savePolicy}>
          <label className="bf-label" htmlFor="ord-policy">Refund policy (shown to attendees on the event page)</label>
          <textarea
            id="ord-policy"
            className="bf-input ord-policy-text"
            value={policyText}
            onChange={(e) => setPolicy(e.target.value)}
            placeholder="e.g. Full refund until 48 hours before the event. No refunds after that."
          />
          <div className="ord-policy-row">
            <button type="submit" className="bf-btn">Save policy</button>
            {policyMsg && <span className="bf-muted" role="status">{policyMsg}</span>}
          </div>
        </form>

        <div className="ord-toolbar">
          <input
            type="search"
            className="bf-input ord-search"
            placeholder="Search by attendee, email or order number"
            aria-label="Search orders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="bf-chips" role="group" aria-label="Filter by status">
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
        </div>

        {note && <p className="bf-muted ord-note" role="status">{note}</p>}
        {actionMsg && <p className="ord-flash" role="status">{actionMsg}</p>}

        <section className="bf-card ord-table-card">
          <div className="bf-table-wrap">
            <table className="bf-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Attendee</th>
                  <th>Tickets</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th><span className="bf-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="bf-muted">
                      {orders.length === 0 ? "No orders yet." : "No orders match your search."}
                    </td>
                  </tr>
                ) : (
                  visible.map((o) => {
                    const s = ORDER_STATUS[o.status] || { label: o.status, badge: "" };
                    return (
                      <tr key={o.id}>
                        <td>
                          {o.id}
                          <span className="bf-muted ord-cell-sub">{shortDateTime(o.created_at)}</span>
                        </td>
                        <td>
                          {o.attendee.full_name}
                          <span className="bf-muted ord-cell-sub">{o.attendee.email}</span>
                        </td>
                        <td>{o.items.map((it) => `${it.quantity} × ${it.ticket_type}`).join(", ")}</td>
                        <td>{kzt(o.total)}</td>
                        <td><span className={`bf-badge ${s.badge}`}>{s.label}</span></td>
                        <td className="ord-row-actions">
                          {o.status === "free" && (
                            <button type="button" className="bf-btn-outline" onClick={() => setConfirming({ order: o, action: "cancel" })}>
                              Cancel registration
                            </button>
                          )}
                          {o.status === "paid" && (
                            <button type="button" className="bf-btn-danger" onClick={() => setConfirming({ order: o, action: "refund" })}>
                              Full refund
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {confirming && (
        <ConfirmDialog
          title={confirming.action === "refund" ? "Refund this order?" : "Cancel this registration?"}
          message={
            confirming.action === "refund"
              ? `${kzt(confirming.order.total)} will be returned to ${confirming.order.attendee.full_name} (simulated) and all tickets in order ${confirming.order.id} become invalid.`
              : `${confirming.order.attendee.full_name}'s free tickets in order ${confirming.order.id} become invalid.`
          }
          confirmLabel={confirming.action === "refund" ? "Refund" : "Cancel registration"}
          danger
          needsReason
          onConfirm={runAction}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default EventOrders;
