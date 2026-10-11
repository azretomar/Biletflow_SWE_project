import { useState } from "react";
import { Link } from "react-router-dom";
import "./createEvent.css";

function CreateEvent() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    venue: "",
    capacity: "",
    category: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Creating event:", form);
  };

  return (
    <div className="ce">
      <header className="ce-nav">
        <Link to="/" className="ce-logo">BiletFlow</Link>
        <Link to="/" className="ce-nav-link">← Back to home</Link>
      </header>

      <main className="ce-main">
        <div className="ce-head">
          <h1>Create an event</h1>
          <p>Fill in the details below. Creating an event and giving out free tickets is free.</p>
        </div>

        <form className="ce-form" onSubmit={handleSubmit}>
          <section className="ce-card">
            <h2>Basic info</h2>

            <div className="field">
              <label htmlFor="title">Event title</label>
              <input
                id="title"
                name="title"
                type="text"
                placeholder="e.g. Astana Jazz Night"
                value={form.title}
                onChange={handleChange}
              />
            </div>

            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                placeholder="What should attendees know about this event?"
                value={form.description}
                onChange={handleChange}
              />
            </div>

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
          </section>

          <section className="ce-card">
            <h2>When and where</h2>

            <div className="ce-row">
              <div className="field">
                <label htmlFor="date">Date</label>
                <input id="date" name="date" type="date" value={form.date} onChange={handleChange} />
              </div>
              <div className="field">
                <label htmlFor="venue">Venue</label>
                <input
                  id="venue"
                  name="venue"
                  type="text"
                  placeholder="e.g. Astana Concert Hall"
                  value={form.venue}
                  onChange={handleChange}
                />
              </div>
            </div>
          </section>

          <section className="ce-card">
            <h2>Capacity</h2>

            <div className="field ce-narrow">
              <label htmlFor="capacity">Maximum number of attendees</label>
              <input
                id="capacity"
                name="capacity"
                type="number"
                min="1"
                placeholder="e.g. 200"
                value={form.capacity}
                onChange={handleChange}
              />
            </div>
          </section>

          <div className="ce-actions">
            <Link to="/" className="ce-btn ce-btn-secondary">Cancel</Link>
            <button type="submit" className="ce-btn">Create event</button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default CreateEvent;
