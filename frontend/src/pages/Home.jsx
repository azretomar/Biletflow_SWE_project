import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import EventImage from "../components/EventImage";
import { useApi, statusNote } from "../lib/useApi";
import { kzt, shortDateTime } from "../lib/format";
import { categoryName, sortUpcoming } from "../lib/events";
import "./home.css";
import { t } from "../i18n";

const CATEGORIES = [
  { value: "", get label() { return t("All categories"); } },
  { value: "music", get label() { return t("Music"); } },
  { value: "education", get label() { return t("Education"); } },
  { value: "sports", get label() { return t("Sports"); } },
  { value: "other", get label() { return t("Other"); } },
];

function Home() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const navigate = useNavigate();
  const { data: events, status, error } = useApi("/events", []);
  const upcoming = sortUpcoming(events || []).filter((ev) => new Date(ev.date) >= new Date()).slice(0, 6);

  function handleSearch(e) {
    e.preventDefault();
    const q = new URLSearchParams();
    if (search.trim()) q.set("q", search.trim());
    if (category) q.set("category", category);
    navigate(`/events${q.toString() ? `?${q}` : ""}`);
  }

  return (
    <div className="home">
      <Navbar />

      <section className="home-hero">
        <h1>{t("Discover events across Kazakhstan")}</h1>
        <p>{t("Concerts, meetups, sports and student events. Get your ticket in a few clicks and check in with a QR code.")}</p>

        <form className="home-search" onSubmit={handleSearch} role="search">
          <label htmlFor="home-search-input" className="sr-only">{t("Search events")}</label>
          <input
            id="home-search-input"
            type="search"
            placeholder={t("Search events or venues")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label htmlFor="home-category" className="sr-only">{t("Category")}</label>
          <select id="home-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <button type="submit" className="home-btn">{t("Search")}</button>
        </form>
      </section>

      <section id="events" className="home-section">
        <h2>{t("Upcoming events")}</h2>
        {status === "loading" ? (
          <p className="bf-muted">{t("Loading events...")}</p>
        ) : upcoming.length === 0 ? (
          <div className="home-empty">
            <p>{status === "ready" ? t("No upcoming events yet. Check back soon.") : statusNote(status, error)}</p>
          </div>
        ) : (
          <div className="home-event-grid">
            {upcoming.map((ev) => (
              <article key={ev.id} className="bf-card">
                <EventImage src={ev.image_url} />
                <span className="bf-category">{categoryName(ev.category)}</span>
                <h3>{ev.title}</h3>
                <p className="bf-muted">{shortDateTime(ev.date)} · {ev.venue}</p>
                <div className="home-card-foot">
                  <strong>{ev.min_price === 0 ? t("Free") : t("from {price}", { price: kzt(ev.min_price) })}</strong>
                  <Link to={`/events/${ev.id}`}>{t("View event")} &gt;</Link>
                </div>
              </article>
            ))}
          </div>
        )}
        {upcoming.length > 0 && (
          <p className="home-all-link"><Link to="/events">{t("See all events")} &gt;</Link></p>
        )}
      </section>

      <section id="organizers" className="home-section home-organizers">
        <div>
          <h2>{t("Hosting an event?")}</h2>
          <p>{t("Creating an event and giving out free tickets costs nothing. Turn on paid sales only when you need them.")}</p>
          <Link to="/create-event" className="home-btn">{t("Create an event")}</Link>
        </div>

        <ul className="home-features">
          <li>
            <strong>{t("Free tickets are free")}</strong>
            <span>{t("No platform fee for free events.")}</span>
          </li>
          <li>
            <strong>{t("QR-code tickets")}</strong>
            <span>{t("Attendees get a digital ticket they can also print.")}</span>
          </li>
          <li>
            <strong>{t("Fast check-in")}</strong>
            <span>{t("Your staff scan tickets at the door with the mobile app.")}</span>
          </li>
          <li>
            <strong>{t("Paid sales in KZT")}</strong>
            <span>{t("Activate paid tickets per event when you are ready.")}</span>
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
