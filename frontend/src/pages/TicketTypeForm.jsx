import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Navbar from "../components/Navbar";
import "./ticketTypeForm.css";

function TicketTypeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const p = Number(price);
    const q = Number(quantity);
    if (!name.trim()) return setError("Enter a ticket name.");
    if (!Number.isInteger(p) || p < 0) return setError("Price must be 0 (free) or a whole number of KZT.");
    if (!Number.isInteger(q) || q < 1) return setError("Quantity must be at least 1.");
    setBusy(true);
    try {
      // Sales dates, max per order and "hidden" are not stored by the backend yet.
      await api(`/events/${id}/ticket-types`, {
        method: "POST",
        body: { name: name.trim(), description, price: p, quantity: q },
      });
      navigate(`/organizer/events/${id}`);
    } catch (err) {
      setError(err.status === 401 || err.status === 403 ? "Only the organizer of this event can add ticket types." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ttf">
      <Navbar />

      <main className="bf-page ttf-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;Back to Event management</Link>
        <h1 className="bf-title">Add ticket type</h1>

        <form className="bf-card ttf-card" onSubmit={handleSubmit}>
          <label className="bf-label" htmlFor="ttf-name">Ticket name</label>
          <input
            id="ttf-name"
            className="bf-input"
            type="text"
            placeholder="e.g. Student"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label className="bf-label" htmlFor="ttf-description">Description</label>
          <textarea
            id="ttf-description"
            className="bf-input ttf-textarea"
            placeholder="What does this ticket include?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="ttf-row">
            <div>
              <label className="bf-label" htmlFor="ttf-price">Price (KZT)</label>
              <input
                id="ttf-price"
                className="bf-input"
                type="number"
                min="0"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
              <span className="bf-muted ttf-hint">0 for a free ticket</span>
            </div>
            <div>
              <label className="bf-label" htmlFor="ttf-quantity">Quantity</label>
              <input
                id="ttf-quantity"
                className="bf-input"
                type="number"
                min="1"
                placeholder="e.g. 50"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="ttf-row">
            <div>
              <label className="bf-label" htmlFor="ttf-start">Sales start</label>
              <input
                id="ttf-start"
                className="bf-input"
                type="date"
                value={salesStart}
                onChange={(e) => setSalesStart(e.target.value)}
              />
            </div>
            <div>
              <label className="bf-label" htmlFor="ttf-end">Sales end</label>
              <input
                id="ttf-end"
                className="bf-input"
                type="date"
                value={salesEnd}
                onChange={(e) => setSalesEnd(e.target.value)}
              />
            </div>
          </div>

          <label className="bf-label" htmlFor="ttf-max">Max tickets per order</label>
          <input
            id="ttf-max"
            className="bf-input ttf-short"
            type="number"
            min="1"
            placeholder="e.g. 5"
            value={maxPerOrder}
            onChange={(e) => setMaxPerOrder(e.target.value)}
          />

          <label className="ttf-toggle">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
            />
            Hide this ticket type
          </label>

          {error && <p className="ttf-error" role="alert">{error}</p>}
          <div className="ttf-actions">
            <Link to={`/organizer/events/${id}`} className="bf-btn-outline">Cancel</Link>
            <button type="submit" className="bf-btn" disabled={busy}>{busy ? "Saving..." : "Save ticket type"}</button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default TicketTypeForm;