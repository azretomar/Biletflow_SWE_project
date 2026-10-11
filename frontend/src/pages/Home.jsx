import { useState } from "react";
import { Link } from "react-router-dom";
import "./home.css";

const CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "music", label: "Music" },
  { value: "education", label: "Education" },
  { value: "sports", label: "Sports" },
  { value: "other", label: "Other" },
];

// Home page: where attendees discover events (SRS 1.2, 2.3)
// and organizers find out how to create one.
function Home() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  // Events will come from the backend later: GET /api/events
  const events = [];

  function handleSearch(e) {
    e.preventDefault();
    // TODO: when the events API is ready, load events filtered by search and category.
  }

  return (
    <div className="home">
      <header className="home-nav">
        <Link to="/" className="home-logo">BiletFlow</Link>
        <nav className="home-nav-links" aria-label="Main">
          <a href="#events">Events</a>
          <a href="#organizers">For organizers</a>
          <Link to="/login">Log in</Link>
          <Link to="/signup" className="home-btn home-btn-small">Sign up</Link>
        </nav>
      </header>

      <section className="home-hero">
        <h1>Discover events across Kazakhstan</h1>
        <p>Concerts, meetups, sports and student events. Get your ticket in a few clicks and check in with a QR code.</p>

        <form className="home-search" onSubmit={handleSearch} role="search">
          <label htmlFor="home-search-input" className="sr-only">Search events</label>
          <input
            id="home-search-input"
            type="search"
            placeholder="Search events or venues"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label htmlFor="home-category" className="sr-only">Category</label>
          <select id="home-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <button type="submit" className="home-btn">Search</button>
        </form>
      </section>

      <section id="events" className="home-section">
        <h2>Upcoming events</h2>
        {events.length === 0 ? (
          <div className="home-empty">
            <p>No events yet. Check back soon.</p>
          </div>
        ) : (
          <div className="home-event-grid">{/* Event cards go here */}</div>
        )}
      </section>

      <section id="organizers" className="home-section home-organizers">
        <div>
          <h2>Hosting an event?</h2>
          <p>Creating an event and giving out free tickets costs nothing. Turn on paid sales only when you need them.</p>
          <Link to="/create-event" className="home-btn">Create an event</Link>
        </div>

        <ul className="home-features">
          <li>
            <strong>Free tickets are free</strong>
            <span>No platform fee for free events.</span>
          </li>
          <li>
            <strong>QR-code tickets</strong>
            <span>Attendees get a digital ticket they can also print.</span>
          </li>
          <li>
            <strong>Fast check-in</strong>
            <span>Your staff scan tickets at the door with the mobile app.</span>
          </li>
          <li>
            <strong>Paid sales in KZT</strong>
            <span>Activate paid tickets per event when you are ready.</span>
          </li>
        </ul>
      </section>

      <footer className="home-footer">
        <span>© 2026 BiletFlow</span>
        <span>CSCI 361 · Team 5</span>
      </footer>
    </div>
  );
}

export default Home;
