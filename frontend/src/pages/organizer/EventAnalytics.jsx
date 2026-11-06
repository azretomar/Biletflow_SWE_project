import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import "./eventAnalytics.css";

// Event analytics for organizers (SRS 4.15).
//
// The page shows what the backend will send for one event. Until the endpoint
// exists, everything starts at zero / empty. Expected response of
// GET /api/organizer/events/:id/analytics (proposal, agree with backend):
// {
//   event: { title, starts_at, venue },
//   capacity, sold, checked_in,
//   revenue: { gross, discounts, refunds, net },          // KZT
//   sales_by_day: [{ date: "2026-11-01", tickets, revenue }],
//   by_ticket_type: [{ name, price, quantity, sold, revenue }],
//   promo: [{ code, redemptions, discount_total }]
// }
const EMPTY_ANALYTICS = {
  event: { title: "Event name", starts_at: null, venue: "" },
  capacity: 0,
  sold: 0,
  checked_in: 0,
  revenue: { gross: 0, discounts: 0, refunds: 0, net: 0 },
  sales_by_day: [],
  by_ticket_type: [],
  promo: [],
};

function kzt(amount) {
  return amount.toLocaleString("en-US") + " ₸";
}

function shortDate(value) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function eventDate(value) {
  const d = new Date(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// Bar chart of tickets sold per day. One series, so no legend: the title names it.
function SalesChart({ days }) {
  if (days.length === 0) {
    return <p className="bf-muted ea-empty">No sales yet. Daily sales will appear here once tickets are sold.</p>;
  }

  const max = Math.max(...days.map((d) => d.tickets), 1);
  const total = days.reduce((sum, d) => sum + d.tickets, 0);
  // Show at most about 8 date labels so they never overlap.
  const labelStep = Math.ceil(days.length / 8);

  return (
    <div className="ea-chart" role="img" aria-label={`Tickets sold per day: ${total} tickets over ${days.length} days, highest ${max} in one day.`}>
      <div className="ea-chart-axis" aria-hidden="true">
        <span>{max}</span>
        <span>{Math.round(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="ea-chart-plot">
        <div className="ea-chart-grid" aria-hidden="true"><span /><span /><span /></div>
        <div className="ea-chart-bars">
          {days.map((d, i) => (
            <div key={d.date} className="ea-bar-slot" tabIndex={0} aria-label={`${shortDate(d.date)}: ${d.tickets} tickets, ${kzt(d.revenue)}`}>
              <div className="ea-bar" style={{ height: (d.tickets / max) * 100 + "%" }}>
                <div className="ea-tooltip" aria-hidden="true">
                  <strong>{shortDate(d.date)}</strong>
                  <span>{d.tickets} tickets</span>
                  <span>{kzt(d.revenue)}</span>
                </div>
              </div>
              {i % labelStep === 0 && <span className="ea-bar-label" aria-hidden="true">{shortDate(d.date)}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventAnalytics() {
  const { id } = useParams();
  const [data] = useState(EMPTY_ANALYTICS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ticketType, setTicketType] = useState("");

  // Filters work on the data already loaded. When the API exists, send them as query parameters too.
  const days = data.sales_by_day.filter((d) => (!from || d.date >= from) && (!to || d.date <= to));
  const types = data.by_ticket_type.filter((t) => !ticketType || t.name === ticketType);

  const remaining = Math.max(data.capacity - data.sold, 0);
  const notArrived = Math.max(data.sold - data.checked_in, 0);
  const attendance = percent(data.checked_in, data.sold);

  return (
    <div className="ea">
      <Navbar />

      <main className="bf-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;Back to Event management</Link>
        <h1 className="bf-title ea-title">Event analytics</h1>
        <p className="bf-muted ea-subtitle">
          {data.event.title}
          {data.event.starts_at && " | " + eventDate(data.event.starts_at)}
          {data.event.venue && " | " + data.event.venue}
        </p>

        <form className="ea-filters" onSubmit={(e) => e.preventDefault()} aria-label="Filters">
          <div>
            <label className="bf-label" htmlFor="ea-from">From</label>
            <input id="ea-from" className="bf-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="bf-label" htmlFor="ea-to">To</label>
            <input id="ea-to" className="bf-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="bf-label" htmlFor="ea-type">Ticket type</label>
            <select id="ea-type" className="bf-input" value={ticketType} onChange={(e) => setTicketType(e.target.value)}>
              <option value="">All ticket types</option>
              {data.by_ticket_type.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          {(from || to || ticketType) && (
            <button type="button" className="bf-btn-outline ea-reset" onClick={() => { setFrom(""); setTo(""); setTicketType(""); }}>
              Reset
            </button>
          )}
        </form>

        <h2 className="ea-section-title">Tickets</h2>
        <div className="bf-stats">
          <div className="bf-stat"><div className="bf-stat-label">Capacity</div><div className="bf-stat-value">{data.capacity}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">Sold</div><div className="bf-stat-value">{data.sold}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">Remaining</div><div className="bf-stat-value">{remaining}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">Sold out</div><div className="bf-stat-value">{percent(data.sold, data.capacity)}%</div></div>
        </div>

        <h2 className="ea-section-title">Revenue</h2>
        <div className="bf-stats">
          <div className="bf-stat"><div className="bf-stat-label">Gross</div><div className="bf-stat-value">{kzt(data.revenue.gross)}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">Discounts</div><div className="bf-stat-value">{kzt(data.revenue.discounts)}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">Refunds</div><div className="bf-stat-value">{kzt(data.revenue.refunds)}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">Net</div><div className="bf-stat-value">{kzt(data.revenue.net)}</div></div>
        </div>
        <p className="bf-muted ea-note">Payments are simulated for the demo. No real money is moved.</p>

        <section className="bf-card ea-card">
          <h2 className="ea-card-title">Tickets sold per day</h2>
          <SalesChart days={days} />
        </section>

        <div className="ea-grid">
          <section className="bf-card ea-card">
            <h2 className="ea-card-title">Sales by ticket type</h2>
            <div className="bf-table-wrap">
              <table className="bf-table">
                <thead>
                  <tr><th>Ticket type</th><th>Price</th><th>Sold</th><th>Left</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {types.length === 0 ? (
                    <tr><td colSpan={5} className="bf-muted">No ticket types yet.</td></tr>
                  ) : (
                    types.map((t) => (
                      <tr key={t.name}>
                        <td>{t.name}</td>
                        <td>{t.price === 0 ? "Free" : kzt(t.price)}</td>
                        <td>{t.sold}</td>
                        <td>{Math.max(t.quantity - t.sold, 0)}</td>
                        <td>{kzt(t.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bf-card ea-card">
            <h2 className="ea-card-title">Attendance</h2>
            <div className="ea-attendance">
              <span className="ea-big">{attendance}%</span>
              <span className="bf-muted">of ticket holders checked in</span>
            </div>
            <div className="ea-progress" role="progressbar" aria-valuenow={attendance} aria-valuemin={0} aria-valuemax={100} aria-label="Checked in">
              <div className="ea-progress-bar" style={{ width: attendance + "%" }} />
            </div>
            <dl className="ea-attendance-list">
              <dt>Checked in</dt><dd>{data.checked_in}</dd>
              <dt>Not yet arrived</dt><dd>{notArrived}</dd>
            </dl>
          </section>
        </div>

        <section className="bf-card ea-card">
          <h2 className="ea-card-title">Promo code results</h2>
          <div className="bf-table-wrap">
            <table className="bf-table">
              <thead>
                <tr><th>Code</th><th>Times used</th><th>Discount given</th></tr>
              </thead>
              <tbody>
                {data.promo.length === 0 ? (
                  <tr><td colSpan={3} className="bf-muted">No promo codes used yet. <Link to="/organizer/promo">Create a campaign</Link></td></tr>
                ) : (
                  data.promo.map((p) => (
                    <tr key={p.code}>
                      <td><code>{p.code}</code></td>
                      <td>{p.redemptions}</td>
                      <td>{kzt(p.discount_total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default EventAnalytics;
