import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Navbar from "../components/Navbar";
import { useApi } from "../lib/useApi";
import "./ticketTypeForm.css";
import { t } from "../i18n";

const TZ = "+05:00";

function toKzInput(value) {
  if (!value) return "";
  const d = new Date(new Date(value).getTime() + 5 * 60 * 60 * 1000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

function TicketTypeForm() {
  const { id, typeId } = useParams();
  const editing = Boolean(typeId);
  const navigate = useNavigate();
  const eventReq = useApi(editing ? `/events/${id}` : null, null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [salesStart, setSalesStart] = useState("");
  const [salesEnd, setSalesEnd] = useState("");
  const [maxPerOrder, setMaxPerOrder] = useState("");
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const existing = editing && eventReq.data
    ? (eventReq.data.ticket_types || []).find((tt) => tt.id === typeId)
    : null;
  const issued = existing ? existing.quantity - existing.quantity_left : 0;

  useEffect(() => {
    if (!existing || loaded) return;
    setName(existing.name);
    setDescription(existing.description || "");
    setPrice(String(existing.price));
    setQuantity(String(existing.quantity));
    setSalesStart(toKzInput(existing.sales_starts_at));
    setSalesEnd(toKzInput(existing.sales_ends_at));
    setMaxPerOrder(existing.max_per_order ? String(existing.max_per_order) : "");
    setHidden(Boolean(existing.hidden));
    setLoaded(true);
  }, [existing, loaded]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const p = Number(price);
    const q = Number(quantity);
    if (!name.trim()) return setError(t("Enter a ticket name."));
    if (!Number.isInteger(p) || p < 0) return setError(t("Price must be 0 (free) or a whole number of KZT."));
    if (!Number.isInteger(q) || q < 1) return setError(t("Quantity must be at least 1."));
    const max = maxPerOrder.trim() === "" ? null : Number(maxPerOrder);
    if (max !== null && (!Number.isInteger(max) || max < 1 || max > 10)) {
      return setError(t("Max tickets per order must be a whole number from 1 to 10."));
    }
    if (salesStart && salesEnd && salesStart >= salesEnd) {
      return setError(t("Sales must start before they end."));
    }
    setBusy(true);
    try {
      await api(editing ? `/events/${id}/ticket-types/${typeId}` : `/events/${id}/ticket-types`, {
        method: editing ? "PUT" : "POST",
        body: {
          name: name.trim(),
          description,
          price: p,
          quantity: q,
          sales_starts_at: salesStart ? salesStart + ":00" + TZ : null,
          sales_ends_at: salesEnd ? salesEnd + ":00" + TZ : null,
          max_per_order: max,
          hidden,
        },
      });
      navigate(`/organizer/events/${id}`);
    } catch (err) {
      setError(err.status === 401 || err.status === 403 ? t("Only the organizer of this event can add ticket types.") : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ttf">
      <Navbar />

      <main className="bf-page ttf-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;{t("Back to Event management")}</Link>
        <h1 className="bf-title">{editing ? t("Edit ticket type") : t("Add ticket type")}</h1>
        {editing && eventReq.status === "loading" && <p className="bf-muted">{t("Loading...")}</p>}
        {editing && eventReq.status !== "loading" && !existing && (
          <p className="ttf-error" role="alert">{t("This ticket type was not found.")}</p>
        )}
        {editing && issued > 0 && (
          <p className="bf-muted">
            {t("{n} tickets were already issued, so the price stays the same and the quantity cannot go below {n}.", { n: issued })}
          </p>
        )}

        <form className="bf-card ttf-card" onSubmit={handleSubmit}>
          <label className="bf-label" htmlFor="ttf-name">{t("Ticket name")}</label>
          <input
            id="ttf-name"
            className="bf-input"
            type="text"
            placeholder={t("e.g. Student")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label className="bf-label" htmlFor="ttf-description">{t("Description")}</label>
          <textarea
            id="ttf-description"
            className="bf-input ttf-textarea"
            placeholder={t("What does this ticket include?")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="ttf-row">
            <div>
              <label className="bf-label" htmlFor="ttf-price">{t("Price (KZT)")}</label>
              <input
                id="ttf-price"
                className="bf-input"
                type="number"
                min="0"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={editing && issued > 0}
                required
              />
              <span className="bf-muted ttf-hint">{t("0 for a free ticket")}</span>
            </div>
            <div>
              <label className="bf-label" htmlFor="ttf-quantity">{t("Quantity")}</label>
              <input
                id="ttf-quantity"
                className="bf-input"
                type="number"
                min="1"
                placeholder={t("e.g. 50")}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="ttf-row">
            <div>
              <label className="bf-label" htmlFor="ttf-start">{t("Sales start")}</label>
              <input
                id="ttf-start"
                className="bf-input"
                type="datetime-local"
                value={salesStart}
                onChange={(e) => setSalesStart(e.target.value)}
              />
            </div>
            <div>
              <label className="bf-label" htmlFor="ttf-end">{t("Sales end")}</label>
              <input
                id="ttf-end"
                className="bf-input"
                type="datetime-local"
                value={salesEnd}
                onChange={(e) => setSalesEnd(e.target.value)}
              />
            </div>
          </div>

          <label className="bf-label" htmlFor="ttf-max">{t("Max tickets per order")}</label>
          <input
            id="ttf-max"
            className="bf-input ttf-short"
            type="number"
            min="1"
            max="10"
            placeholder={t("e.g. 5")}
            value={maxPerOrder}
            onChange={(e) => setMaxPerOrder(e.target.value)}
          />

          <label className="ttf-toggle">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
            />
            {t("Hide this ticket type")}
          </label>
          <p className="bf-muted ttf-hint">
            {t("Sales times are Kazakhstan time (UTC+5). Leave them empty to sell for as long as registration is open. A hidden ticket type is not shown to attendees and cannot be bought.")}
          </p>

          {error && <p className="ttf-error" role="alert">{error}</p>}
          <div className="ttf-actions">
            <Link to={`/organizer/events/${id}`} className="bf-btn-outline">{t("Cancel")}</Link>
            <button type="submit" className="bf-btn" disabled={busy}>{busy ? t("Saving...") : t("Save ticket type")}</button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default TicketTypeForm;
