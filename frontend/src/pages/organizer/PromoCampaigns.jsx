import { useState } from "react";
import { Link } from "react-router-dom";
import "./promo.css";

// Promo campaigns for an organizer's event (SRS 4.14).
//
// For now campaigns live only in memory and start empty. When the backend
// has promo endpoints, load them here (e.g. GET /api/events/:id/campaigns)
// and send the form with POST. The server must generate the real promo code,
// the campaign QR image and check every discount (SRS 4.14, 7).

const EMPTY_FORM = {
  name: "",
  discountType: "percent", // "percent" or "fixed"
  amount: "",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
};

// Makes a readable code like "STUDENT-7K2Q" for the preview.
function makeCode(name) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "PROMO";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += chars[Math.floor(Math.random() * chars.length)];
  return base + "-" + tail;
}

function campaignStatus(c) {
  if (c.disabled) return "disabled";
  const now = new Date();
  if (now < new Date(c.startsAt)) return "scheduled";
  if (now > new Date(c.endsAt)) return "expired";
  if (c.redemptions >= c.maxRedemptions) return "exhausted";
  return "active";
}

function formatDiscount(c) {
  return c.discountType === "percent"
    ? c.amount + "% off"
    : c.amount.toLocaleString("en-US") + " ₸ off";
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Checks the form. Returns { fieldName: message } for each problem (empty = OK).
function validate(form) {
  const errors = {};
  const amount = Number(form.amount);
  const max = Number(form.maxRedemptions);

  if (!form.name.trim()) errors.name = "Enter a campaign name.";
  if (!form.amount || amount <= 0) errors.amount = "Enter a discount greater than 0.";
  else if (form.discountType === "percent" && amount > 100) errors.amount = "A percentage cannot be more than 100.";
  if (!form.startsAt) errors.startsAt = "Choose a start date.";
  if (!form.endsAt) errors.endsAt = "Choose an end date.";
  else if (form.startsAt && form.endsAt < form.startsAt) errors.endsAt = "The end date must be after the start date.";
  if (!form.maxRedemptions || max < 1 || !Number.isInteger(max)) errors.maxRedemptions = "Enter a whole number, at least 1.";

  return errors;
}

function PromoCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [created, setCreated] = useState(null); // the campaign just created

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const campaign = {
      id: Date.now(),
      name: form.name.trim(),
      code: makeCode(form.name),
      discountType: form.discountType,
      amount: Number(form.amount),
      startsAt: form.startsAt,
      endsAt: form.endsAt + "T23:59:59",
      maxRedemptions: Number(form.maxRedemptions),
      redemptions: 0,
      disabled: false,
    };
    setCampaigns([campaign, ...campaigns]);
    setCreated(campaign);
    setForm(EMPTY_FORM);
  };

  const toggleDisabled = (id) => {
    setCampaigns(campaigns.map((c) => (c.id === id ? { ...c, disabled: !c.disabled } : c)));
  };

  const fieldError = (name) =>
    errors[name] ? <span id={name + "-error"} className="pc-error">{errors[name]}</span> : null;

  return (
    <div className="pc">
      <header className="pc-nav">
        <Link to="/" className="pc-logo">BiletFlow</Link>
        <Link to="/" className="pc-nav-link">← Back to home</Link>
      </header>

      <main className="pc-main">
        <div className="pc-head">
          <h1>Promo campaigns</h1>
          <p>Give attendees a discount code and a campaign QR that opens your event with the code applied.</p>
        </div>

        <div className="pc-layout">
          <form className="pc-card" onSubmit={handleSubmit} noValidate>
            <h2>Create a campaign</h2>

            <div className="field">
              <label htmlFor="name">Campaign name</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="e.g. Student discount"
                value={form.name}
                onChange={handleChange}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {fieldError("name")}
            </div>

            <div className="field">
              <span className="label-text">Discount type</span>
              <div className="pc-toggle" role="group" aria-label="Discount type">
                <button
                  type="button"
                  className={form.discountType === "percent" ? "active" : ""}
                  aria-pressed={form.discountType === "percent"}
                  onClick={() => setForm({ ...form, discountType: "percent" })}
                >
                  Percentage (%)
                </button>
                <button
                  type="button"
                  className={form.discountType === "fixed" ? "active" : ""}
                  aria-pressed={form.discountType === "fixed"}
                  onClick={() => setForm({ ...form, discountType: "fixed" })}
                >
                  Fixed amount (₸)
                </button>
              </div>
            </div>

            <div className="pc-row">
              <div className="field">
                <label htmlFor="amount">{form.discountType === "percent" ? "Discount (%)" : "Discount (₸)"}</label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  min="1"
                  max={form.discountType === "percent" ? 100 : undefined}
                  placeholder={form.discountType === "percent" ? "e.g. 20" : "e.g. 2000"}
                  value={form.amount}
                  onChange={handleChange}
                  aria-invalid={!!errors.amount}
                  aria-describedby={errors.amount ? "amount-error" : undefined}
                />
                {fieldError("amount")}
              </div>
              <div className="field">
                <label htmlFor="maxRedemptions">Max redemptions</label>
                <input
                  id="maxRedemptions"
                  name="maxRedemptions"
                  type="number"
                  min="1"
                  placeholder="e.g. 100"
                  value={form.maxRedemptions}
                  onChange={handleChange}
                  aria-invalid={!!errors.maxRedemptions}
                  aria-describedby={errors.maxRedemptions ? "maxRedemptions-error" : undefined}
                />
                {fieldError("maxRedemptions")}
              </div>
            </div>

            <div className="pc-row">
              <div className="field">
                <label htmlFor="startsAt">Valid from</label>
                <input
                  id="startsAt"
                  name="startsAt"
                  type="date"
                  value={form.startsAt}
                  onChange={handleChange}
                  aria-invalid={!!errors.startsAt}
                  aria-describedby={errors.startsAt ? "startsAt-error" : undefined}
                />
                {fieldError("startsAt")}
              </div>
              <div className="field">
                <label htmlFor="endsAt">Valid until</label>
                <input
                  id="endsAt"
                  name="endsAt"
                  type="date"
                  value={form.endsAt}
                  onChange={handleChange}
                  aria-invalid={!!errors.endsAt}
                  aria-describedby={errors.endsAt ? "endsAt-error" : undefined}
                />
                {fieldError("endsAt")}
              </div>
            </div>

            <button type="submit" className="pc-btn">Create campaign</button>
          </form>

          <aside className="pc-card pc-result" aria-live="polite">
            {created ? (
              <>
                <h2>Campaign created</h2>
                <p className="pc-muted">{created.name} · {formatDiscount(created)}</p>
                <span className="pc-label">Promo code</span>
                <div className="pc-code">{created.code}</div>
                <span className="pc-label">Campaign QR</span>
                <div className="pc-qr">
                  <span>The QR image will be generated by the server.</span>
                  <small>It opens the event page with this code applied. It is not an admission ticket.</small>
                </div>
              </>
            ) : (
              <>
                <h2>Promo code and QR</h2>
                <p className="pc-muted">After you create a campaign, its promo code and campaign QR appear here.</p>
                <div className="pc-qr pc-qr-empty"><span>No campaign yet</span></div>
              </>
            )}
          </aside>
        </div>

        <section className="pc-card pc-list">
          <h2>Your campaigns</h2>
          {campaigns.length === 0 ? (
            <p className="pc-muted">No campaigns yet.</p>
          ) : (
            <div className="pc-table-wrap">
              <table className="pc-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Code</th>
                    <th>Discount</th>
                    <th>Valid</th>
                    <th>Redeemed</th>
                    <th>Status</th>
                    <th><span className="pc-sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const status = campaignStatus(c);
                    return (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td><code>{c.code}</code></td>
                        <td>{formatDiscount(c)}</td>
                        <td className="pc-nowrap">{formatDate(c.startsAt)} – {formatDate(c.endsAt)}</td>
                        <td>{c.redemptions} / {c.maxRedemptions}</td>
                        <td><span className={"pc-badge pc-badge-" + status}>{status}</span></td>
                        <td className="pc-actions">
                          <button type="button" className="pc-btn-small" onClick={() => toggleDisabled(c.id)}>
                            {c.disabled ? "Enable" : "Disable"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default PromoCampaigns;
