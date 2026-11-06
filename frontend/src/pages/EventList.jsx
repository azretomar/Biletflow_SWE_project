import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./eventList.css";

const CATEGORIES = [
  { value: "", label: "Category: All" },
  { value: "music", label: "Music" },
  { value: "education", label: "Education" },
  { value: "sports", label: "Sports" },
  { value: "other", label: "Other" },
];

const DATES = [
  { value: "", label: "Date: Any" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

function EventList() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");

  const events = [];

  function handleSearch(e) {
    e.preventDefault();
  }

  return (
    <div className="events">
      <Navbar />

      <section className="events-banner">
        <div className="events-banner-inner">
          <h1>Events</h1>
          <form className="events-search" onSubmit={handleSearch} role="search">
            <label htmlFor="events-search-input" className="events-sr">Search events</label>
            <input
              id="events-search-input"
              type="search"
              placeholder="Search events or venues"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label htmlFor="events-category" className="events-sr">Category</label>
            <select id="events-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <label htmlFor="events-date" className="events-sr">Date</label>
            <select id="events-date" value={date} onChange={(e) => setDate(e.target.value)}>
              {DATES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <button type="submit" className="bf-btn">Search</button>
          </form>
        </div>
      </section>

      <main className="bf-page">
        {events.length === 0 ? (
          <div className="events-empty">
            <p>No events yet. Check back soon.</p>
          </div>
        ) : (
          <div className="events-grid">
            {events.map((ev) => (
              <article key={ev.id} className="bf-card events-card">
                <div className="bf-img events-card-img">Event image</div>
                <span className="bf-category">{ev.category}</span>
                <h3>{ev.title}</h3>
                <p className="bf-muted">{ev.date} · {ev.venue}</p>
                <div className="events-card-foot">
                  <strong>{ev.price}</strong>
                  <Link to={`/events/${ev.id}`}>View event &gt;</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default EventList;