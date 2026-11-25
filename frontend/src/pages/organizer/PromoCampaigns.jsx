import { useState } from "react";
import { Link } from "react-router-dom";
import QrCode from "../../components/QrCode";
import { useApi, send, NOT_CONNECTED_TEXT } from "../../lib/useApi";
import "./promo.css";
import { locale, t } from "../../i18n";

function campaignLink(c) {
  if (!c.eventId) return "";
  return `${window.location.origin}/events/${c.eventId}?promo=${encodeURIComponent(c.code)}`;
}

function fromApi(c) {
  return {
    id: c.id,
    eventId: c.event_id,
    name: c.name,
    code: c.code,
    discountType: c.discount_type,
    amount: c.amount,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    maxRedemptions: c.max_redemptions,
    redemptions: c.redemptions || 0,
    disabled: Boolean(c.disabled),
    qrUrl: c.qr_url || "",
  };
}

const EMPTY_FORM = {
  eventId: "",
  name: "",
  discountType: "percent",
  amount: "",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
};

function makeCode(name) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "PROMO";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += chars[Math.floor(Math.random() * chars.length)];
  return base + "-" + tail;
}

const CAMPAIGN_STATUS = {
  get disabled() { return t("disabled"); },
  get scheduled() { return t("scheduled"); },
  get expired() { return t("expired"); },
  get exhausted() { return t("exhausted"); },
  get active() { return t("active"); },
};

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
    ? t("{n}% off", { n: c.amount })
    : t("{n} ₸ off", { n: c.amount.toLocaleString(locale()) });
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

function validate(form) {
  const errors = {};
  const amount = Number(form.amount);
  const max = Number(form.maxRedemptions);

  if (!form.name.trim()) errors.name = t("Enter a campaign name.");
  if (!form.amount || amount <= 0) errors.amount = t("Enter a discount greater than 0.");
  else if (form.discountType === "percent" && amount > 100) errors.amount = t("A percentage cannot be more than 100.");
  if (!form.startsAt) errors.startsAt = t("Choose a start date.");
  if (!form.endsAt) errors.endsAt = t("Choose an end date.");
  else if (form.startsAt && form.endsAt < form.startsAt) errors.endsAt = t("The end date must be after the start date.");
  if (!form.maxRedemptions || max < 1 || !Number.isInteger(max)) errors.maxRedemptions = t("Enter a whole number, at least 1.");

  return errors;
}

function PromoCampaigns() {
  const list = useApi("/organizer/campaigns", []);
  const eventsReq = useApi("/organizer/events", []);
  const [localCampaigns, setLocalCampaigns] = useState([]);
  const campaigns = [...localCampaigns, ...(list.data || []).map(fromApi)];
  const connected = list.status === "ready";
  const [saveNote, setSaveNote] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [created, setCreated] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaveNote("");

    const body = {
      event_id: form.eventId || null,
      name: form.name.trim(),
      discount_type: form.discountType,
      amount: Number(form.amount),
      starts_at: form.startsAt,
      ends_at: form.endsAt + "T23:59:59",
      max_redemptions: Number(form.maxRedemptions),
    };
    const r = await send("/organizer/campaigns", "POST", body);
    if (r.ok) {
      const saved = fromApi(r.data);
      list.setData([r.data, ...(list.data || [])]);
      setCreated(saved);
      setForm(EMPTY_FORM);
      return;
    }
    if (r.message !== t(NOT_CONNECTED_TEXT)) {
      setSaveNote(r.message);
      return;
    }
    setSaveNote(t("Shown here only: promo campaigns are not saved to the server yet."));
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
    setLocalCampaigns([campaign, ...localCampaigns]);
    setCreated(campaign);
    setForm(EMPTY_FORM);
  };

  const toggleDisabled = async (id) => {
    const local = localCampaigns.find((c) => c.id === id);
    if (local) {
      setLocalCampaigns(localCampaigns.map((c) => (c.id === id ? { ...c, disabled: !c.disabled } : c)));
      return;
    }
    const current = campaigns.find((c) => c.id === id);
    const r = await send(`/organizer/campaigns/${id}`, "PATCH", { disabled: !current.disabled });
    if (r.ok) list.setData((list.data || []).map((c) => (c.id === id ? { ...c, disabled: !current.disabled } : c)));
    else setSaveNote(r.message);
  };

  const fieldError = (name) =>
    errors[name] ? <span id={name + "-error"} className="pc-error">{errors[name]}</span> : null;

  return (
    <div className="pc">
      <header className="pc-nav">
        <Link to="/" className="pc-logo">BiletFlow</Link>
        <Link to="/" className="pc-nav-link">← {t("Back to home")}</Link>
      </header>

      <main className="pc-main">
        <div className="pc-head">
          <h1>{t("Promo campaigns")}</h1>
          <p>{t("Give attendees a discount code and a campaign QR that opens your event with the code applied.")}</p>
        </div>

        <div className="pc-layout">
          <form className="pc-card" onSubmit={handleSubmit} noValidate>
            <h2>{t("Create a campaign")}</h2>

            {eventsReq.status === "ready" && eventsReq.data.length > 0 && (
              <div className="field">
                <label htmlFor="eventId">{t("Event")}</label>
                <select id="eventId" name="eventId" value={form.eventId} onChange={handleChange}>
                  <option value="">{t("Choose an event...")}</option>
                  {eventsReq.data.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label htmlFor="name">{t("Campaign name")}</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder={t("e.g. Student discount")}
                value={form.name}
                onChange={handleChange}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {fieldError("name")}
            </div>

            <div className="field">
              <span className="label-text">{t("Discount type")}</span>
              <div className="pc-toggle" role="group" aria-label={t("Discount type")}>
                <button
                  type="button"
                  className={form.discountType === "percent" ? "active" : ""}
                  aria-pressed={form.discountType === "percent"}
                  onClick={() => setForm({ ...form, discountType: "percent" })}
                >
                  {t("Percentage (%)")}
                </button>
                <button
                  type="button"
                  className={form.discountType === "fixed" ? "active" : ""}
                  aria-pressed={form.discountType === "fixed"}
                  onClick={() => setForm({ ...form, discountType: "fixed" })}
                >
                  {t("Fixed amount (₸)")}
                </button>
              </div>
            </div>

            <div className="pc-row">
              <div className="field">
                <label htmlFor="amount">{form.discountType === "percent" ? t("Discount (%)") : t("Discount (₸)")}</label>
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
                <label htmlFor="maxRedemptions">{t("Max redemptions")}</label>
                <input
                  id="maxRedemptions"
                  name="maxRedemptions"
                  type="number"
                  min="1"
                  placeholder={t("e.g. 100")}
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
                <label htmlFor="startsAt">{t("Valid from")}</label>
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
                <label htmlFor="endsAt">{t("Valid until")}</label>
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

            {saveNote && <p className="pc-save-note" role="status">{saveNote}</p>}
            <button type="submit" className="pc-btn">{t("Create campaign")}</button>
          </form>

          <aside className="pc-card pc-result" aria-live="polite">
            {created ? (
              <>
                <h2>{created.redemptions > 0 || created.disabled ? t("Campaign") : t("Campaign created")}</h2>
                <p className="pc-muted">{created.name} · {formatDiscount(created)}</p>
                <span className="pc-label">{t("Promo code")}</span>
                <div className="pc-code">{created.code}</div>
                <span className="pc-label">{t("Campaign QR")}</span>
                <div className="pc-qr">
                  {created.qrUrl ? (
                    <img src={created.qrUrl} alt={t("Campaign QR for code {code}", { code: created.code })} className="pc-qr-img" />
                  ) : campaignLink(created) ? (
                    <>
                      <QrCode value={campaignLink(created)} size={180} label={t("Campaign QR for code {code}", { code: created.code })} />
                      <a href={campaignLink(created)} className="pc-qr-link">{campaignLink(created)}</a>
                    </>
                  ) : (
                    <span>{t("This code works for all your events, so it has no QR. Share the code itself.")}</span>
                  )}
                  <small>{t("It opens the event page with this code applied. It is not an admission ticket.")}</small>
                </div>
              </>
            ) : (
              <>
                <h2>{t("Promo code and QR")}</h2>
                <p className="pc-muted">{t("After you create a campaign, its promo code and campaign QR appear here.")}</p>
                <div className="pc-qr pc-qr-empty"><span>{t("No campaign yet")}</span></div>
              </>
            )}
          </aside>
        </div>

        <section className="pc-card pc-list">
          <h2>{t("Your campaigns")}</h2>
          {!connected && list.status !== "loading" && (
            <p className="pc-muted" role="status">{list.status === "not_connected" ? t(NOT_CONNECTED_TEXT) : list.error}</p>
          )}
          {campaigns.length === 0 ? (
            <p className="pc-muted">{t("No campaigns yet.")}</p>
          ) : (
            <div className="pc-table-wrap">
              <table className="pc-table">
                <thead>
                  <tr>
                    <th>{t("Campaign")}</th>
                    <th>{t("Code")}</th>
                    <th>{t("Discount")}</th>
                    <th>{t("Valid")}</th>
                    <th>{t("Redeemed")}</th>
                    <th>{t("Status")}</th>
                    <th><span className="pc-sr-only">{t("Actions")}</span></th>
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
                        <td><span className={"pc-badge pc-badge-" + status}>{CAMPAIGN_STATUS[status]}</span></td>
                        <td className="pc-actions">
                          <button type="button" className="pc-btn-small" onClick={() => setCreated(c)}>
                            {t("Show QR")}
                          </button>
                          <button type="button" className="pc-btn-small" onClick={() => toggleDisabled(c.id)}>
                            {c.disabled ? t("Enable") : t("Disable")}
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
