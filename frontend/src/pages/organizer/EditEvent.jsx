import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useApi, send, statusNote } from "../../lib/useApi";
import "./editEvent.css";
import { t } from "../../i18n";

// Edit event. The current details are loaded from GET /api/events/{id} (already in the backend).
// Saving: PUT /api/events/{id} with the same fields as POST /api/events
//   { title, description, date, venue, capacity, category, image_url, registration_closes_at }
// Times are Kazakhstan time (UTC+5).
const TZ = "+05:00";

const EMPTY_EVENT = {
  title: "",
  description: "",
  category: "",
  date: "",
  time: "",
  venue: "",
  capacity: "",
  image_url: "",
};

// "2026-12-14T19:00:00+05:00" -> { date: "2026-12-14", time: "19:00" } in Kazakhstan time
function splitKz(value) {
  if (!value) return { date: "", time: "" };
  const d = new Date(new Date(value).getTime() + 5 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function EditEvent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: event, status, error, code } = useApi(`/events/${id}`, null);
  const notFound = status === "not_connected" || code === 404 || code === 400;
  const [form, setForm] = useState(EMPTY_EVENT);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!event) return;
    const { date, time } = splitKz(event.date);
    setForm({
      title: event.title || "",
      description: event.description || "",
      category: event.category || "",
      date,
      time,
      venue: event.venue || "",
      capacity: String(event.capacity || ""),
      image_url: event.image_url || "",
    });
  }, [event]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    const cap = Number(form.capacity);
    if (!form.title.trim() || !form.venue.trim() || !form.date || !form.time) {
      setMessage(t("Title, date, start time and venue are required."));
      return;
    }
    if (!Number.isInteger(cap) || cap < 1) {
      setMessage(t("Capacity must be a whole number, at least 1."));
      return;
    }
    setBusy(true);
    const r = await send(`/events/${id}`, "PUT", {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      date: `${form.date}T${form.time}:00${TZ}`,
      venue: form.venue.trim(),
      capacity: cap,
      image_url: form.image_url.trim(),
      registration_closes_at: event ? event.registration_closes_at || null : null,
    });
    setBusy(false);
    if (r.ok) navigate(`/organizer/events/${id}`);
    else setMessage(r.message);
  }

  return (
    <div className="ee">
      <Navbar />

      <main className="bf-page ee-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;{t("Back to Event management")}</Link>
        <h1 className="bf-title">{t("Edit event")}</h1>
        {status === "loading" && <p className="bf-muted">{t("Loading event...")}</p>}
        {(status === "error" || status === "not_connected") && (
          <p className="ee-message" role="alert">{notFound ? t("Event not found.") : statusNote(status, error)}</p>
        )}

        {event && (
          <form className="bf-card ee-card" onSubmit={handleSubmit} noValidate>
            <label className="bf-label" htmlFor="ee-title">{t("Event title")}</label>
            <input id="ee-title" name="title" className="bf-input" type="text" maxLength={200}
              value={form.title} onChange={handleChange} required />

            <label className="bf-label" htmlFor="ee-description">{t("Description")}</label>
            <textarea id="ee-description" name="description" className="bf-input ee-textarea"
              value={form.description} onChange={handleChange} />

            <div className="ee-row">
              <div>
                <label className="bf-label" htmlFor="ee-category">{t("Category")}</label>
                <select id="ee-category" name="category" className="bf-input" value={form.category} onChange={handleChange}>
                  <option value="">{t("Select...")}</option>
                  <option value="music">{t("Music")}</option>
                  <option value="education">{t("Education")}</option>
                  <option value="sports">{t("Sports")}</option>
                  <option value="other">{t("Other")}</option>
                </select>
              </div>
              <div>
                <label className="bf-label" htmlFor="ee-image">{t("Cover image link")}</label>
                <input id="ee-image" name="image_url" className="bf-input" type="url" placeholder="https://..."
                  value={form.image_url} onChange={handleChange} />
              </div>
            </div>

            <div className="ee-row">
              <div>
                <label className="bf-label" htmlFor="ee-date">{t("Date")}</label>
                <input id="ee-date" name="date" className="bf-input" type="date" value={form.date} onChange={handleChange} required />
              </div>
              <div>
                <label className="bf-label" htmlFor="ee-time">{t("Starts (Kazakhstan time)")}</label>
                <input id="ee-time" name="time" className="bf-input" type="time" value={form.time} onChange={handleChange} required />
              </div>
            </div>

            <div className="ee-row">
              <div>
                <label className="bf-label" htmlFor="ee-venue">{t("Venue")}</label>
                <input id="ee-venue" name="venue" className="bf-input" type="text" value={form.venue} onChange={handleChange} required />
              </div>
              <div>
                <label className="bf-label" htmlFor="ee-capacity">{t("Maximum number of attendees")}</label>
                <input id="ee-capacity" name="capacity" className="bf-input" type="number" min="1"
                  value={form.capacity} onChange={handleChange} required />
              </div>
            </div>

            <p className="bf-muted ee-hint">{t("Attendees who already have tickets will see the new details.")}</p>
            {message && <p className="ee-message" role="alert">{message}</p>}
            <div className="ee-actions">
              <Link to={`/organizer/events/${id}`} className="bf-btn-outline">{t("Cancel")}</Link>
              <button type="submit" className="bf-btn" disabled={busy}>{busy ? t("Saving...") : t("Save changes")}</button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

export default EditEvent;
