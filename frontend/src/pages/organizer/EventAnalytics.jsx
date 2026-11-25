import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import { useApi, statusNote } from "../../lib/useApi";
import "./eventAnalytics.css";
import { locale, t } from "../../i18n";

const EMPTY_ANALYTICS = {
  event: { get title() { return t("Event name"); }, starts_at: null, venue: "" },
  capacity: 0,
  sold: 0,
  checked_in: 0,
  revenue: { gross: 0, discounts: 0, refunds: 0, net: 0 },
  sales_by_day: [],
  by_ticket_type: [],
  promo: [],
};

function kzt(amount) {
  return amount.toLocaleString(locale()) + " ₸";
}

function shortDate(value) {
  return new Date(value).toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

function eventDate(value) {
  const d = new Date(value);
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
}

function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function SalesChart({ days }) {
  if (days.length === 0) {
    return <p className="bf-muted ea-empty">{t("No sales yet. Daily sales will appear here once tickets are sold.")}</p>;
  }

  const max = Math.max(...days.map((d) => d.tickets), 1);
  const total = days.reduce((sum, d) => sum + d.tickets, 0);
  const labelStep = Math.ceil(days.length / 8);

  return (
    <div className="ea-chart" role="img" aria-label={t("Tickets sold per day: {total} tickets over {days} days, highest {max} in one day.", { total, days: days.length, max })}>
      <div className="ea-chart-axis" aria-hidden="true">
        <span>{max}</span>
        <span>{Math.round(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="ea-chart-plot">
        <div className="ea-chart-grid" aria-hidden="true"><span /><span /><span /></div>
        <div className="ea-chart-bars">
          {days.map((d, i) => (
            <div key={d.date} className="ea-bar-slot" tabIndex={0} aria-label={t("{date}: {n} tickets, {amount}", { date: shortDate(d.date), n: d.tickets, amount: kzt(d.revenue) })}>
              <div className="ea-bar" style={{ height: (d.tickets / max) * 100 + "%" }}>
                <div className="ea-tooltip" aria-hidden="true">
                  <strong>{shortDate(d.date)}</strong>
                  <span>{t("{n} tickets", { n: d.tickets })}</span>
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
  const { data, status, error } = useApi(`/organizer/events/${id}/analytics`, EMPTY_ANALYTICS);
  const note = statusNote(status, error);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ticketType, setTicketType] = useState("");

  const days = data.sales_by_day.filter((d) => (!from || d.date >= from) && (!to || d.date <= to));
  const types = data.by_ticket_type.filter((tt) => !ticketType || tt.name === ticketType);

  const remaining = Math.max(data.capacity - data.sold, 0);
  const notArrived = Math.max(data.sold - data.checked_in, 0);
  const attendance = percent(data.checked_in, data.sold);

  return (
    <div className="ea">
      <Navbar />

      <main className="bf-page">
        <Link to={`/organizer/events/${id}`} className="bf-back">&lt;{t("Back to Event management")}</Link>
        <h1 className="bf-title ea-title">{t("Event analytics")}</h1>
        <p className="bf-muted ea-subtitle">
          {data.event.title}
          {data.event.starts_at && " | " + eventDate(data.event.starts_at)}
          {data.event.venue && " | " + data.event.venue}
        </p>

        {note && <p className="bf-muted ea-note" role="status">{note}</p>}

        <form className="ea-filters" onSubmit={(e) => e.preventDefault()} aria-label={t("Filters")}>
          <div>
            <label className="bf-label" htmlFor="ea-from">{t("From")}</label>
            <input id="ea-from" className="bf-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="bf-label" htmlFor="ea-to">{t("To")}</label>
            <input id="ea-to" className="bf-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="bf-label" htmlFor="ea-type">{t("Ticket type")}</label>
            <select id="ea-type" className="bf-input" value={ticketType} onChange={(e) => setTicketType(e.target.value)}>
              <option value="">{t("All ticket types")}</option>
              {data.by_ticket_type.map((tt) => (
                <option key={tt.name} value={tt.name}>{tt.name}</option>
              ))}
            </select>
          </div>
          {(from || to || ticketType) && (
            <button type="button" className="bf-btn-outline ea-reset" onClick={() => { setFrom(""); setTo(""); setTicketType(""); }}>
              {t("Reset")}
            </button>
          )}
        </form>

        <h2 className="ea-section-title">{t("Tickets")}</h2>
        <div className="bf-stats">
          <div className="bf-stat"><div className="bf-stat-label">{t("Capacity")}</div><div className="bf-stat-value">{data.capacity}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">{t("Sold")}</div><div className="bf-stat-value">{data.sold}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">{t("Remaining")}</div><div className="bf-stat-value">{remaining}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">{t("Sold out")}</div><div className="bf-stat-value">{percent(data.sold, data.capacity)}%</div></div>
        </div>

        <h2 className="ea-section-title">{t("Revenue")}</h2>
        <div className="bf-stats">
          <div className="bf-stat"><div className="bf-stat-label">{t("Gross")}</div><div className="bf-stat-value">{kzt(data.revenue.gross)}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">{t("Discounts")}</div><div className="bf-stat-value">{kzt(data.revenue.discounts)}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">{t("Refunds")}</div><div className="bf-stat-value">{kzt(data.revenue.refunds)}</div></div>
          <div className="bf-stat"><div className="bf-stat-label">{t("Net")}</div><div className="bf-stat-value">{kzt(data.revenue.net)}</div></div>
        </div>
        <p className="bf-muted ea-note">{t("Payments are simulated for the demo. No real money is moved.")}</p>

        <section className="bf-card ea-card">
          <h2 className="ea-card-title">{t("Tickets sold per day")}</h2>
          <SalesChart days={days} />
        </section>

        <div className="ea-grid">
          <section className="bf-card ea-card">
            <h2 className="ea-card-title">{t("Sales by ticket type")}</h2>
            <div className="bf-table-wrap">
              <table className="bf-table">
                <thead>
                  <tr><th>{t("Ticket type")}</th><th>{t("Price")}</th><th>{t("Sold")}</th><th>{t("Left")}</th><th>{t("Revenue")}</th></tr>
                </thead>
                <tbody>
                  {types.length === 0 ? (
                    <tr><td colSpan={5} className="bf-muted">{t("No ticket types yet.")}</td></tr>
                  ) : (
                    types.map((tt) => (
                      <tr key={tt.name}>
                        <td>{tt.name}</td>
                        <td>{tt.price === 0 ? t("Free") : kzt(tt.price)}</td>
                        <td>{tt.sold}</td>
                        <td>{Math.max(tt.quantity - tt.sold, 0)}</td>
                        <td>{kzt(tt.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bf-card ea-card">
            <h2 className="ea-card-title">{t("Attendance")}</h2>
            <div className="ea-attendance">
              <span className="ea-big">{attendance}%</span>
              <span className="bf-muted">{t("of ticket holders checked in")}</span>
            </div>
            <div className="ea-progress" role="progressbar" aria-valuenow={attendance} aria-valuemin={0} aria-valuemax={100} aria-label={t("Checked in")}>
              <div className="ea-progress-bar" style={{ width: attendance + "%" }} />
            </div>
            <dl className="ea-attendance-list">
              <dt>{t("Checked in")}</dt><dd>{data.checked_in}</dd>
              <dt>{t("Not yet arrived")}</dt><dd>{notArrived}</dd>
            </dl>
          </section>
        </div>

        <section className="bf-card ea-card">
          <h2 className="ea-card-title">{t("Promo code results")}</h2>
          <div className="bf-table-wrap">
            <table className="bf-table">
              <thead>
                <tr><th>{t("Code")}</th><th>{t("Times used")}</th><th>{t("Discount given")}</th></tr>
              </thead>
              <tbody>
                {data.promo.length === 0 ? (
                  <tr><td colSpan={3} className="bf-muted">{t("No promo codes used yet.")} <Link to="/organizer/promo">{t("Create a campaign")}</Link></td></tr>
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
