import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useApi, send, statusNote } from "../../lib/useApi";
import { kzt, shortDateTime, ORDER_STATUS } from "../../lib/format";
import "../orders.css";
import { t } from "../../i18n";

const FILTERS = [
  { value: "", get label() { return t("All"); } },
  { value: "paid", get label() { return t("Paid"); } },
  { value: "free", get label() { return t("Free"); } },
  { value: "cancelled", get label() { return t("Cancelled"); } },
  { value: "refunded", get label() { return t("Refunded"); } },
];

function EventOrders() {
  const { id } = useParams();
  const { data: orders, setData: setOrders, status, error } = useApi(`/organizer/events/${id}/orders`, []);
  const policyReq = useApi(`/organizer/events/${id}/refund-policy`, { policy: "" });
  const [policy, setPolicy] = useState(null);
  const [policyMsg, setPolicyMsg] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [actionMsg, setActionMsg] = useState("");

  const policyText = policy ?? policyReq.data.policy ?? "";

  const visible = orders.filter((o) => {
    const text = (o.id + " " + o.attendee.full_name + " " + o.attendee.email).toLowerCase();
    return (!filter || o.status === filter) && (!search || text.includes(search.toLowerCase()));
  });

  async function savePolicy(e) {
    e.preventDefault();
    const r = await send(`/organizer/events/${id}/refund-policy`, "PUT", { policy: policyText });
    setPolicyMsg(r.ok ? t("Refund policy saved.") : r.message);
  }

  async function runAction(reason) {
    const { order, action } = confirming;
    const r = await send(`/organizer/orders/${order.id}/${action}`, "POST", { reason });
    if (r.ok) {
      const newStatus = action === "refund" ? "refunded" : "cancelled";
      setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
      setActionMsg(newStatus === "refunded"
        ? t("Order {id} refunded. Its tickets are no longer valid.", { id: order.id })
        : t("Order {id} cancelled. Its tickets are no longer valid.", { id: order.id }));
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
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;{t("Back to Event management")}</Link>
        <h1 className="bf-title">{t("Orders and refunds")}</h1>

        <form className="bf-card ord-policy" onSubmit={savePolicy}>
          <label className="bf-label" htmlFor="ord-policy">{t("Refund policy (shown to attendees on the event page)")}</label>
          <textarea
            id="ord-policy"
            className="bf-input ord-policy-text"
            value={policyText}
            onChange={(e) => setPolicy(e.target.value)}
            placeholder={t("e.g. Full refund until 48 hours before the event. No refunds after that.")}
          />
          <div className="ord-policy-row">
            <button type="submit" className="bf-btn">{t("Save policy")}</button>
            {policyMsg && <span className="bf-muted" role="status">{policyMsg}</span>}
          </div>
        </form>

        <div className="ord-toolbar">
          <input
            type="search"
            className="bf-input ord-search"
            placeholder={t("Search by attendee, email or order number")}
            aria-label={t("Search orders")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="bf-chips" role="group" aria-label={t("Filter by status")}>
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
                  <th>{t("Order")}</th>
                  <th>{t("Attendee")}</th>
                  <th>{t("Tickets")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Status")}</th>
                  <th><span className="bf-sr-only">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="bf-muted">
                      {orders.length === 0 ? t("No orders yet.") : t("No orders match your search.")}
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
                              {t("Cancel registration")}
                            </button>
                          )}
                          {o.status === "paid" && (
                            <button type="button" className="bf-btn-danger" onClick={() => setConfirming({ order: o, action: "refund" })}>
                              {t("Full refund")}
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
          title={confirming.action === "refund" ? t("Refund this order?") : t("Cancel this registration?")}
          message={
            confirming.action === "refund"
              ? t("{amount} will be returned to {name} (simulated) and all tickets in order {id} become invalid.", { amount: kzt(confirming.order.total), name: confirming.order.attendee.full_name, id: confirming.order.id })
              : t("The free tickets of {name} in order {id} become invalid.", { name: confirming.order.attendee.full_name, id: confirming.order.id })
          }
          confirmLabel={confirming.action === "refund" ? t("Refund") : t("Cancel registration")}
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
