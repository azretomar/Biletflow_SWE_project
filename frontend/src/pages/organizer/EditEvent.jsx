import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import "./editEvent.css";

const EMPTY_EVENT = {
  title: "",
  description: "",
  category: "",
  date: "",
  venue: "",
  capacity: "",
};

function EditEvent() {
  const { id } = useParams();
  const [form, setForm] = useState(EMPTY_EVENT);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e) {
    e.preventDefault();
  }

  return (
    <div className="ee">
      <Navbar />

      <main className="bf-page ee-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;Back to Event management</Link>
        <h1 className="bf-title">Edit event</h1>

        <form className="bf-card ee-card" onSubmit={handleSubmit}>
          <label className="bf-label" htmlFor="ee-title">Event title</label>
          <input
            id="ee-title"
            name="title"
            className="bf-input"
            type="text"
            placeholder="e.g. Astana Jazz Night"
            value={form.title}
            onChange={handleChange}
            required
          />

          <label className="bf-label" htmlFor="ee-description">Description</label>
          <textarea
            id="ee-description"
            name="description"
            className="bf-input ee-textarea"
            placeholder="What should attendees know about this event?"
            value={form.description}
            onChange={handleChange}
          />

          <label className="bf-label" htmlFor="ee-category">Category</label>
          <select
            id="ee-category"
            name="category"
            className="bf-input"
            value={form.category}
            onChange={handleChange}
            required
          >
            <option value="">Select...</option>
            <option value="music">Music</option>
            <option value="education">Education</option>
            <option value="sports">Sports</option>
            <option value="other">Other</option>
          </select>

          <div className="ee-row">
            <div>
              <label className="bf-label" htmlFor="ee-date">Date</label>
              <input
                id="ee-date"
                name="date"
                className="bf-input"
                type="date"
                value={form.date}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="bf-label" htmlFor="ee-venue">Venue</label>
              <input
                id="ee-venue"
                name="venue"
                className="bf-input"
                type="text"
                placeholder="e.g. Astana Concert Hall"
                value={form.venue}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <label className="bf-label" htmlFor="ee-capacity">Maximum number of attendees</label>
          <input
            id="ee-capacity"
            name="capacity"
            className="bf-input ee-short"
            type="number"
            min="1"
            placeholder="e.g. 200"
            value={form.capacity}
            onChange={handleChange}
            required
          />

          <div className="ee-actions">
            <Link to={`/organizer/events/${id}`} className="bf-btn-outline">Cancel</Link>
            <button type="submit" className="bf-btn">Save changes</button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default EditEvent;