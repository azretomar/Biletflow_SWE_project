import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import EventImage from "../components/EventImage";
import { useApi, statusNote } from "../lib/useApi";
import { kzt, shortDateTime } from "../lib/format";
import { CATEGORY_OPTIONS, filterEvents, sortUpcoming } from "../lib/events";
import "./eventList.css";

const DATES = [
  { value: "", label: "Date: Upcoming" },
  { value: "today", label: "Today" },
  { value: "week", label: "Next 7 days" },
  { value: "month", label: "This month" },
  { value: "past", label: "Past events" },
  { value: "all", label: "Any date" },
];

// Public event list: GET /api/events, filtered in the browser.
// Filters are also kept in the address (?q=&category=&date=) so a search can be shared,
// and the Home page search lands here.
function EventList() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [date, setDate] = useState(params.get("date") || "");
  const { data: events, status, error, reload } = useApi("/events", []);

  const visible = sortUpcoming(filterEvents(events || [], { search, category, date }));
  const filtering = Boolean(search.trim() || category || date);

  function handleSearch(e) {
    e.preventDefault();
    const next = {};
    if (search.trim()) next.q = search.trim();
    if (category) next.category = category;
    if (date) next.date = date;
    setParams(next);
  }

  function clearFilters() {
    setSearch("");
    setCategory("");
    setDate("");
    setParams({});
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
              <option value="">Category: All</option>
              {CATEGORY_OPTIONS.map((c) => (
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
        {status === "loading" && <p className="bf-muted">Loading events...</p>}
        {(status === "error" || status === "not_connected") && (
          <div className="events-empty" role="alert">
            <p>{statusNote(status, error)}</p>
            <button type="button" className="bf-btn-outline" onClick={reload}>Try again</button>
          </div>
        )}

        {status === "ready" && (
          <>
            {filtering && (
              <p className="bf-muted events-count" role="status">
                {visible.length} event{visible.length === 1 ? "" : "s"} found ·{" "}
                <button type="button" className="events-clear" onClick={clearFilters}>Clear filters</button>
              </p>
            )}
            {visible.length === 0 ? (
              <div className="events-empty">
                <p>{events.length === 0 ? "No events yet. Check back soon." : "No events match your search."}</p>
              </div>
            ) : (
              <div className="events-grid">
                {visible.map((ev) => (
                  <article key={ev.id} className="bf-card events-card">
                    <EventImage src={ev.image_url} className="events-card-img" />
                    <span className="bf-category">{ev.category}</span>
                    <h3>{ev.title}</h3>
                    <p className="bf-muted">{shortDateTime(ev.date)} · {ev.venue}</p>
                    <div className="events-card-foot">
                      <strong>{ev.min_price === 0 ? "Free" : `from ${kzt(ev.min_price)}`}</strong>
                      <Link to={`/events/${ev.id}`}>View event &gt;</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default EventList;
