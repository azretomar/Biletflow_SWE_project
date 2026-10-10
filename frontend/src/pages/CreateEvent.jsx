import { useState } from "react";

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
    <div className="page">
      <h1>Create event</h1>

      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="title">Event Title</label>
          <input id="title" name="title" type="text" value={form.title} onChange={handleChange} />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" value={form.description} onChange={handleChange} />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" name="date" type="date" value={form.date} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="venue">Venue</label>
            <input id="venue" name="venue" type="text" value={form.venue} onChange={handleChange} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="capacity">Capacity</label>
            <input id="capacity" name="capacity" type="number" min="1" value={form.capacity} onChange={handleChange} />
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
        </div>

        <button type="submit" className="btn">
          Create Event
        </button>
      </form>
    </div>
  );
}

export default CreateEvent;