import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import EventImage from "../components/EventImage";
import { useApi, statusNote } from "../lib/useApi";
import { kzt, shortDateTime } from "../lib/format";
import { CATEGORY_OPTIONS, categoryName, filterEvents, sortUpcoming } from "../lib/events";
import "./eventList.css";
import { t } from "../i18n";

const DATES = [
  { value: "", get label() { return t("Date: Upcoming"); } },
  { value: "today", get label() { return t("Today"); } },
  { value: "week", get label() { return t("Next 7 days"); } },
  { value: "month", get label() { return t("This month"); } },
  { value: "past", get label() { return t("Past events"); } },
  { value: "all", get label() { return t("Any date"); } },
];

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
          <h1>{t("Events")}</h1>
          <form className="events-search" onSubmit={handleSearch} role="search">
            <label htmlFor="events-search-input" className="events-sr">{t("Search events")}</label>
            <input
              id="events-search-input"
              type="search"
              placeholder={t("Search events or venues")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label htmlFor="events-category" className="events-sr">{t("Category")}</label>
            <select id="events-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t("Category: All")}</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <label htmlFor="events-date" className="events-sr">{t("Date")}</label>
            <select id="events-date" value={date} onChange={(e) => setDate(e.target.value)}>
              {DATES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <button type="submit" className="bf-btn">{t("Search")}</button>
          </form>
        </div>
      </section>

      <main className="bf-page">
        {status === "loading" && <p className="bf-muted">{t("Loading events...")}</p>}
        {(status === "error" || status === "not_connected") && (
          <div className="events-empty" role="alert">
            <p>{statusNote(status, error)}</p>
            <button type="button" className="bf-btn-outline" onClick={reload}>{t("Try again")}</button>
          </div>
        )}

        {status === "ready" && (
          <>
            {filtering && (
              <p className="bf-muted events-count" role="status">
                {t("{n} events found", { n: visible.length })} ·{" "}
                <button type="button" className="events-clear" onClick={clearFilters}>{t("Clear filters")}</button>
              </p>
            )}
            {visible.length === 0 ? (
              <div className="events-empty">
                <p>{events.length === 0 ? t("No events yet. Check back soon.") : t("No events match your search.")}</p>
              </div>
            ) : (
              <div className="events-grid">
                {visible.map((ev) => (
                  <article key={ev.id} className="bf-card events-card">
                    <EventImage src={ev.image_url} className="events-card-img" />
                    <span className="bf-category">{categoryName(ev.category)}</span>
                    <h3>{ev.title}</h3>
                    <p className="bf-muted">{shortDateTime(ev.date)} · {ev.venue}</p>
                    <div className="events-card-foot">
                      <strong>{ev.min_price === 0 ? t("Free") : t("from {price}", { price: kzt(ev.min_price) })}</strong>
                      <Link to={`/events/${ev.id}`}>{t("View event")} &gt;</Link>
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
