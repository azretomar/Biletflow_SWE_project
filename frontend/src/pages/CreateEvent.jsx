import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { send } from "../lib/useApi";
import "./createEvent.css";

// Create event (SRS 4.2): details, time and place, visibility, registration window,
// image, preview, and "Save as draft" or "Publish".
//
// Publish uses POST /api/events, which already exists. The backend currently accepts only
// title, description, date, venue, capacity, category, image_url, registration_closes_at
// and publishes every event as public. Still needed (proposal):
//   POST /api/events with also { status: "draft" | "published", visibility: "public" | "unlisted" | "private",
//                                ends_at, registration_opens_at, venue_address }
// Kazakhstan uses one time zone (UTC+5), so times are sent with +05:00.

const TZ = "+05:00";

const EMPTY_EVENT = {
  title: "",
  description: "",
  category: "",
  image_url: "",
  venue: "",
  venue_address: "",
  date: "",
  start_time: "",
  end_time: "",
  capacity: "",
  visibility: "public",
  registration_opens_at: "",
  registration_closes_at: "",
};

const VISIBILITY = [
  { value: "public", label: "Public", hint: "Listed on BiletFlow and in search." },
  { value: "unlisted", label: "Unlisted", hint: "Not listed; anyone with the link can open it." },
  { value: "private", label: "Private", hint: "Only people you invite can open it." },
];

const CATEGORY_LABELS = { music: "Music", education: "Education", sports: "Sports", other: "Other" };

function iso(date, time) {
  return date && time ? `${date}T${time}:00${TZ}` : null;
}

function localIso(dt) {
  return dt ? `${dt}:00${TZ}` : null;
}

function validate(f) {
  const e = {};
  if (!f.title.trim()) e.title = "Enter a title.";
  else if (f.title.length > 200) e.title = "Keep the title under 200 characters.";
  if (!f.venue.trim()) e.venue = "Enter the venue.";
  if (!f.date) e.date = "Choose the date.";
  if (!f.start_time) e.start_time = "Choose the start time.";
  if (f.end_time && f.start_time && f.end_time <= f.start_time) e.end_time = "The end must be after the start.";
  const cap = Number(f.capacity);
  if (!f.capacity || !Number.isInteger(cap) || cap < 1) e.capacity = "Enter a whole number, at least 1.";
  const start = iso(f.date, f.start_time);
  if (f.registration_closes_at && start && localIso(f.registration_closes_at) > start)
    e.registration_closes_at = "Registration must close before the event starts.";
  if (f.registration_opens_at && f.registration_closes_at && f.registration_opens_at >= f.registration_closes_at)
    e.registration_opens_at = "Registration must open before it closes.";
  if (f.image_url && !/^https?:\/\/\S+$/.test(f.image_url)) e.image_url = "Use a full link starting with https://";
  return e;
}

function Preview({ form }) {
  const when = form.date
    ? new Date(`${form.date}T${form.start_time || "00:00"}`).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "long", year: "numeric",
      }) + (form.start_time ? `, ${form.start_time}${form.end_time ? `–${form.end_time}` : ""}` : "")
    : "Date not set";
  return (
    <section className="ce-card ce-preview" aria-label="Preview">
      <h2>Preview</h2>
      <p className="ce-preview-note">This is roughly how attendees will see your event.</p>
      <div className="ce-preview-event">
        {form.image_url && !/\s/.test(form.image_url) ? (
          <img src={form.image_url} alt="" className="ce-preview-img" />
        ) : (
          <div className="ce-preview-img ce-preview-img-empty">No image</div>
        )}
        <div className="ce-preview-body">
          <span className="ce-preview-meta">
            {CATEGORY_LABELS[form.category] || "Category"} · {VISIBILITY.find((v) => v.value === form.visibility).label}
          </span>
          <h3>{form.title || "Event title"}</h3>
          <p className="ce-preview-meta">{when}</p>
          <p className="ce-preview-meta">{form.venue || "Venue"}{form.venue_address ? `, ${form.venue_address}` : ""}</p>
          <p className="ce-preview-desc">{form.description || "No description yet."}</p>
          <p className="ce-preview-meta">{form.capacity ? `${form.capacity} places` : "Capacity not set"}</p>
        </div>
      </div>
    </section>
  );
}

function CreateEvent() {
  // "Duplicate event" on the Event history page sends the copied details here.
  const location = useLocation();
  const navigate = useNavigate();
  const duplicate = location.state && location.state.duplicate;
  const [form, setForm] = useState(duplicate ? { ...EMPTY_EVENT, ...duplicate, date: "" } : EMPTY_EVENT);
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    // the field was changed, so its old error no longer applies
    if (errors[e.target.name]) {
      const rest = { ...errors };
      delete rest[e.target.name];
      setErrors(rest);
    }
  };

  async function submit(mode) {
    setMessage("");
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setMessage("Check the highlighted fields.");
      return;
    }
    const base = {
      title: form.title.trim(),
      description: form.description.trim(),
      date: iso(form.date, form.start_time),
      venue: form.venue.trim(),
      capacity: Number(form.capacity),
      category: form.category,
      image_url: form.image_url.trim(),
      registration_closes_at: localIso(form.registration_closes_at),
    };
    const extended = {
      ...base,
      status: mode,
      visibility: form.visibility,
      ends_at: form.end_time ? iso(form.date, form.end_time) : null,
      registration_opens_at: localIso(form.registration_opens_at),
      venue_address: form.venue_address.trim(),
    };
    const needsExtended = mode === "draft" || form.visibility !== "public";

    setBusy(true);
    try {
      if (needsExtended) {
        // Drafts and non-public events need the extended endpoint (not built yet).
        const r = await send("/events", "POST", extended);
        if (!r.ok) {
          setMessage(
            r.message === "invalid JSON body"
              ? "The server does not support drafts or unlisted/private events yet. Choose Public and Publish for now."
              : r.message
          );
          return;
        }
        navigate(`/organizer/events/${r.data.id}`);
        return;
      }
      const ev = await api("/events", { method: "POST", body: base });
      navigate(`/organizer/events/${ev.id}`, { state: { created: true } });
    } catch (err) {
      setMessage(err.status === 401 || err.status === 403 ? "Log in with an organizer account to create events." : err.message);
    } finally {
      setBusy(false);
    }
  }

  function fieldError(name) {
    return errors[name] ? <span id={`${name}-error`} className="ce-error">{errors[name]}</span> : null;
  }

  function a11y(name) {
    return { "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `${name}-error` : undefined };
  }

  return (
    <div className="ce">
      <header className="ce-nav">
        <Link to="/" className="ce-logo">BiletFlow</Link>
        <Link to="/organizer/dashboard" className="ce-nav-link">← Back to dashboard</Link>
      </header>

      <main className="ce-main">
        <div className="ce-head">
          <h1>Create an event</h1>
          {duplicate ? (
            <p>Copied from an existing event. Choose a new date and check the details. Ticket types, orders and attendees are not copied.</p>
          ) : (
            <p>Fill in the details below. Creating an event and giving out free tickets is free.</p>
          )}
        </div>

        <form className="ce-form" onSubmit={(e) => { e.preventDefault(); submit("published"); }} noValidate>
          <section className="ce-card">
            <h2>Basic info</h2>
            <div className="field">
              <label htmlFor="title">Event title</label>
              <input id="title" name="title" type="text" maxLength={200} placeholder="e.g. Astana Jazz Night"
                value={form.title} onChange={handleChange} {...a11y("title")} />
              {fieldError("title")}
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea id="description" name="description" placeholder="What should attendees know about this event?"
                value={form.description} onChange={handleChange} />
            </div>
            <div className="ce-row">
              <div className="field">
                <label htmlFor="category">Category</label>
                <select id="category" name="category" value={form.category} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="music">Music</option>
                  <option value="education">Education</option>
                  <option value="sports">Sports</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="image_url">Cover image link</label>
                <input id="image_url" name="image_url" type="url" placeholder="https://..."
                  value={form.image_url} onChange={handleChange} {...a11y("image_url")} />
                {fieldError("image_url")}
              </div>
            </div>
          </section>

          <section className="ce-card">
            <h2>When and where</h2>
            <div className="ce-row ce-row-3">
              <div className="field">
                <label htmlFor="date">Date</label>
                <input id="date" name="date" type="date" value={form.date} onChange={handleChange} {...a11y("date")} />
                {fieldError("date")}
              </div>
              <div className="field">
                <label htmlFor="start_time">Starts</label>
                <input id="start_time" name="start_time" type="time" value={form.start_time} onChange={handleChange} {...a11y("start_time")} />
                {fieldError("start_time")}
              </div>
              <div className="field">
                <label htmlFor="end_time">Ends (optional)</label>
                <input id="end_time" name="end_time" type="time" value={form.end_time} onChange={handleChange} {...a11y("end_time")} />
                {fieldError("end_time")}
              </div>
            </div>
            <p className="ce-hint">Times are Kazakhstan time (UTC+5).</p>
            <div className="ce-row">
              <div className="field">
                <label htmlFor="venue">Venue</label>
                <input id="venue" name="venue" type="text" placeholder="e.g. Astana Concert Hall"
                  value={form.venue} onChange={handleChange} {...a11y("venue")} />
                {fieldError("venue")}
              </div>
              <div className="field">
                <label htmlFor="venue_address">Address (optional)</label>
                <input id="venue_address" name="venue_address" type="text" placeholder="e.g. Kabanbay Batyr Ave 53, Astana"
                  value={form.venue_address} onChange={handleChange} />
              </div>
            </div>
          </section>

          <section className="ce-card">
            <h2>Capacity and registration</h2>
            <div className="ce-row ce-row-3">
              <div className="field">
                <label htmlFor="capacity">Maximum attendees</label>
                <input id="capacity" name="capacity" type="number" min="1" placeholder="e.g. 200"
                  value={form.capacity} onChange={handleChange} {...a11y("capacity")} />
                {fieldError("capacity")}
              </div>
              <div className="field">
                <label htmlFor="registration_opens_at">Registration opens (optional)</label>
                <input id="registration_opens_at" name="registration_opens_at" type="datetime-local"
                  value={form.registration_opens_at} onChange={handleChange} {...a11y("registration_opens_at")} />
                {fieldError("registration_opens_at")}
              </div>
              <div className="field">
                <label htmlFor="registration_closes_at">Registration closes (optional)</label>
                <input id="registration_closes_at" name="registration_closes_at" type="datetime-local"
                  value={form.registration_closes_at} onChange={handleChange} {...a11y("registration_closes_at")} />
                {fieldError("registration_closes_at")}
              </div>
            </div>
          </section>

          <section className="ce-card">
            <h2>Who can see it</h2>
            <fieldset className="ce-visibility">
              <legend className="ce-sr-only">Visibility</legend>
              {VISIBILITY.map((v) => (
                <label key={v.value} className={form.visibility === v.value ? "ce-vis ce-vis-active" : "ce-vis"}>
                  <input type="radio" name="visibility" value={v.value} checked={form.visibility === v.value} onChange={handleChange} />
                  <span>
                    <strong>{v.label}</strong>
                    <small>{v.hint}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          {showPreview && <Preview form={form} />}

          {message && <p className="ce-message" role="alert">{message}</p>}
          <div className="ce-actions">
            <button type="button" className="ce-btn ce-btn-secondary" onClick={() => setShowPreview(!showPreview)} aria-pressed={showPreview}>
              {showPreview ? "Hide preview" : "Preview"}
            </button>
            <button type="button" className="ce-btn ce-btn-secondary" disabled={busy} onClick={() => submit("draft")}>
              Save as draft
            </button>
            <button type="submit" className="ce-btn" disabled={busy}>{busy ? "Saving..." : "Publish"}</button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default CreateEvent;
