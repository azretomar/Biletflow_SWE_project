import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import "./eventManagement.css";

const TABS = [
  { value: "attendees", label: "Attendees" },
  { value: "orders", label: "Orders" },
  { value: "types", label: "Ticket types" },
];

const EMPTY_EVENT = {
  title: "Event name",
  status: "upcoming",
  date: "",
  venue: "",
  capacity: 0,
  sold: 0,
  checked_in: 0,
  paid_activated: false,
};

const STATUS_LABELS = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TICKET_STATUS = {
  valid: { label: "Valid", cls: "bf-badge-valid" },
  checked_in: { label: "Checked in", cls: "bf-badge-checkedin" },
  cancelled: { label: "Cancelled", cls: "bf-badge-cancelled" },
  refunded: { label: "Refunded", cls: "bf-badge-refunded" },
};

const ORDER_STATUS = {
  paid: { label: "Paid", cls: "bf-badge-valid" },
  free: { label: "Free", cls: "bf-badge-completed" },
  refunded: { label: "Refunded", cls: "bf-badge-refunded" },
  cancelled: { label: "Cancelled", cls: "bf-badge-cancelled" },
};

function Badge({ map, status }) {
  const item = map[status] || { label: status, cls: "bf-badge-completed" };
  return <span className={`bf-badge ${item.cls}`}>{item.label}</span>;
}

function EventManagement() {
  const { id } = useParams();
  const [tab, setTab] = useState("attendees");

  const event = EMPTY_EVENT;
  const attendees = [];
  const orders = [];
  const ticketTypes = [];

  const remaining = event.capacity - event.sold;
  const subtitle = [event.date, event.venue].filter(Boolean).join(" | ");

  return (
    <div className="em">
      <Navbar />

      <main className="bf-page">
        <Link to="/organizer/dashboard" className="bf-back">&lt;Back to dashboard</Link>

        <div className="em-head">
          <div>
            <div className="em-title-row">
              <h1 className="em-title">{event.title}</h1>
              <span className={`bf-badge bf-badge-${event.status}`}>{STATUS_LABELS[event.status]}</span>
            </div>
            <p className="bf-muted em-sub">{subtitle || "Date and venue"}</p>
          </div>
          <div className="em-buttons">
            <button type="button" className="bf-btn-danger">Cancel event</button>
            <Link to={`/organizer/events/${id}/edit`} className="bf-btn-outline">Edit event</Link>
            <Link to={`/organizer/events/${id}/ticket-types/new`} className="bf-btn">Add ticket type</Link>
          </div>
        </div>

        <div className="bf-stats">
          <div className="bf-stat">
            <div className="bf-stat-label">Capacity</div>
            <div className="bf-stat-value">{event.capacity}</div>
          </div>
          <div className="bf-stat">
            <div className="bf-stat-label">Sold</div>
            <div className="bf-stat-value">{event.sold}</div>
          </div>
          <div className="bf-stat">
            <div className="bf-stat-label">Remaining</div>
            <div className="bf-stat-value">{remaining}</div>
          </div>
          <div className="bf-stat">
            <div className="bf-stat-label">Checked in</div>
            <div className="bf-stat-value">{event.checked_in}</div>
          </div>
        </div>

        <div className="bf-chips">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={tab === t.value ? "bf-chip bf-chip-active" : "bf-chip"}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bf-table-wrap">
          {tab === "attendees" && (
            <table className="bf-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Ticket type</th>
                  <th>Ticket ID</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {attendees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="bf-muted">No attendees yet.</td>
                  </tr>
                ) : (
                  attendees.map((a) => (
                    <tr key={a.ticket_id}>
                      <td>{a.name}</td>
                      <td>{a.email}</td>
                      <td>{a.ticket_type}</td>
                      <td>{a.ticket_id}</td>
                      <td><Badge map={TICKET_STATUS} status={a.status} /></td>
                      <td>
                        {a.status === "valid" && (
                          <button type="button" className="em-link">Cancel</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === "orders" && (
            <table className="bf-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Buyer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="bf-muted">No orders yet.</td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.id}</td>
                      <td>{o.buyer}</td>
                      <td>{o.total} KZT</td>
                      <td><Badge map={ORDER_STATUS} status={o.status} /></td>
                      <td>
                        {o.status === "paid" && (
                          <button type="button" className="em-link">Refund</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === "types" && (
            <table className="bf-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Sold</th>
                  <th>Left</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {ticketTypes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="bf-muted">No ticket types yet.</td>
                  </tr>
                ) : (
                  ticketTypes.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.price === 0 ? "Free" : `${t.price} KZT`}</td>
                      <td>{t.sold}</td>
                      <td>{t.quantity_left}</td>
                      <td>
                        <button type="button" className="em-link">Edit</button>
                        <button type="button" className="em-link">Hide</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="em-foot">
          <span className="bf-muted">
            Paid sales: {event.paid_activated ? "Activated" : "Not activated"}
          </span>
          {!event.paid_activated && (
            <Link to={`/organizer/events/${id}/activation`}>Activate&gt;</Link>
          )}
        </div>

        <div className="em-foot">
          <Link to={`/organizer/events/${id}/analytics`}>Analytics&gt;</Link>
          <Link to={`/organizer/events/${id}/history`}>History&gt;</Link>
        </div>
      </main>
    </div>
  );
}

export default EventManagement;