import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useApi, send, statusNote } from "../../lib/useApi";
import { kzt, shortDateTime } from "../../lib/format";
import "./eventManagement.css";
import { t } from "../../i18n";

const TABS = [
  { value: "types", get label() { return t("Ticket types"); } },
  { value: "attendees", get label() { return t("Attendees"); } },
  { value: "staff", get label() { return t("Check-in staff"); } },
];

const TICKET_STATUS = {
  valid: { get label() { return t("Valid"); }, cls: "bf-badge-valid" },
  checked_in: { get label() { return t("Checked in"); }, cls: "bf-badge-checkedin" },
  cancelled: { get label() { return t("Cancelled"); }, cls: "bf-badge-cancelled" },
  refunded: { get label() { return t("Refunded"); }, cls: "bf-badge-refunded" },
};

function eventStatus(ev) {
  if (!ev || !ev.date) return null;
  if (ev.status === "cancelled") return { key: "cancelled", label: t("Cancelled") };
  if (ev.status === "draft") return { key: "draft", label: t("Draft") };
  const start = new Date(ev.date);
  const now = new Date();
  if (start > now) return { key: "upcoming", label: t("Upcoming") };
  if (now - start < 12 * 60 * 60 * 1000) return { key: "active", label: t("Active") };
  return { key: "completed", label: t("Completed") };
}

function StaffSection({ eventId }) {
  const { data: staff, setData, status, error } = useApi(`/events/${eventId}/staff`, []);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  async function add(e) {
    e.preventDefault();
    setMsg("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMsg(t("Enter the email the person signed up with."));
      return;
    }
    setBusy(true);
    const r = await send(`/events/${eventId}/staff`, "POST", { email: email.trim() });
    setBusy(false);
    if (r.ok) {
      setData([...staff, r.data]);
      setEmail("");
      setMsg(t("{name} can now check in tickets for this event in the mobile app.", { name: r.data.full_name || r.data.email }));
    } else {
      setMsg(r.message);
    }
  }

  async function remove() {
    const m = removing;
    const r = await send(`/events/${eventId}/staff/${m.user_id}`, "DELETE");
    if (r.ok) setData(staff.filter((s) => s.user_id !== m.user_id));
    setMsg(r.ok ? t("{name} was removed from check-in staff.", { name: m.full_name || m.email }) : r.message);
    setRemoving(null);
  }

  const note = statusNote(status, error);

  return (
    <div className="em-staff">
      <p className="bf-muted em-staff-intro">
        {t("Check-in staff use the BiletFlow mobile app to scan tickets at the door. They only see this event. The person needs a BiletFlow account first.")}
      </p>
      <form className="em-staff-form" onSubmit={add}>
        <label className="bf-sr-only" htmlFor="staff-email">{t("Staff email")}</label>
        <input id="staff-email" type="email" className="bf-input" placeholder="staff@example.kz"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="bf-btn" disabled={busy}>{busy ? t("Adding...") : t("Add staff")}</button>
      </form>
      {msg && <p className="em-msg" role="status">{msg}</p>}
      {note && <p className="bf-muted em-note" role="status">{note}</p>}

      <div className="bf-table-wrap em-table-wrap">
        <table className="bf-table">
          <thead>
            <tr>
              <th>{t("Name")}</th>
              <th>{t("Email")}</th>
              <th>{t("Added")}</th>
              <th><span className="bf-sr-only">{t("Actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={4} className="bf-muted">{t("No check-in staff yet.")}</td></tr>
            ) : (
              staff.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.full_name || "-"}</td>
                  <td>{m.email}</td>
                  <td>{shortDateTime(m.assigned_at)}</td>
                  <td className="em-actions-cell">
                    <button type="button" className="em-link" onClick={() => setRemoving(m)}>{t("Remove")}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {removing && (
        <ConfirmDialog
          title={t("Remove from check-in staff?")}
          message={t("{name} will no longer be able to check in tickets for this event.", { name: removing.full_name || removing.email })}
          confirmLabel={t("Remove")}
          danger
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function AttendeesSection({ eventId, list }) {
  const { data: attendees, setData, status, error } = list;
  const [search, setSearch] = useState("");
  const [undoing, setUndoing] = useState(null);
  const [msg, setMsg] = useState("");
  const note = statusNote(status, error);

  async function undo() {
    const a = undoing;
    setUndoing(null);
    const r = await send("/checkin/undo", "POST", { event_id: eventId, ticket_id: a.ticket_id });
    if (r.ok) {
      setData(attendees.map((x) => (x.ticket_id === a.ticket_id ? { ...x, status: "valid", checked_in_at: null } : x)));
      setMsg(t("Check-in undone for {name}. The ticket can be scanned again.", { name: a.full_name }));
    } else {
      setMsg(r.message);
    }
  }
  const visible = attendees.filter((a) =>
    !search || (a.full_name + " " + a.email + " " + a.ticket_id).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <input type="search" className="bf-input em-search" placeholder={t("Search attendees by name, email or ticket")}
        aria-label={t("Search attendees")} value={search} onChange={(e) => setSearch(e.target.value)} />
      {note && <p className="bf-muted em-note" role="status">{note}</p>}
      {msg && <p className="em-msg" role="status">{msg}</p>}
      <div className="bf-table-wrap em-table-wrap">
        <table className="bf-table">
          <thead>
            <tr>
              <th>{t("Name")}</th>
              <th>{t("Email")}</th>
              <th>{t("Ticket type")}</th>
              <th>{t("Ticket ID")}</th>
              <th>{t("Status")}</th>
              <th><span className="bf-sr-only">{t("Actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={6} className="bf-muted">{attendees.length === 0 ? t("No attendees yet.") : t("No attendees match your search.")}</td></tr>
            ) : (
              visible.map((a) => {
                const s = TICKET_STATUS[a.status] || { label: a.status, cls: "bf-badge-completed" };
                return (
                  <tr key={a.ticket_id}>
                    <td>{a.full_name}</td>
                    <td>{a.email}</td>
                    <td>{a.ticket_type}</td>
                    <td><code>{a.ticket_id}</code></td>
                    <td>
                      <span className={`bf-badge ${s.cls}`}>{s.label}</span>
                      {a.checked_in_at && <span className="bf-muted em-cell-sub">{shortDateTime(a.checked_in_at)}</span>}
                    </td>
                    <td className="em-actions-cell">
                      {a.status === "checked_in" && (
                        <button type="button" className="em-link" onClick={() => setUndoing(a)}>{t("Undo check-in")}</button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {undoing && (
        <ConfirmDialog
          title={t("Undo this check-in?")}
          message={t("The ticket of {name} becomes valid again and can be scanned at the door. Use this only for a check-in made by mistake.", { name: undoing.full_name })}
          confirmLabel={t("Undo check-in")}
          onConfirm={undo}
          onCancel={() => setUndoing(null)}
        />
      )}
    </>
  );
}

function countByType(attendees) {
  const out = {};
  for (const a of attendees) {
    const c = out[a.ticket_type] || (out[a.ticket_type] = { checkedIn: 0, returned: 0 });
    if (a.status === "checked_in") c.checkedIn += 1;
    if (a.status === "refunded" || a.status === "cancelled") c.returned += 1;
  }
  return out;
}

function EventManagement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("types");
  const { data: event, setData: setEvent, status, error, code } = useApi(`/events/${id}`, null);
  const attendeeList = useApi(`/organizer/events/${id}/attendees`, []);
  const location = useLocation();
  const copyErrors = (location.state && location.state.copyErrors) || [];
  const counts = countByType(attendeeList.data);
  const notFound = status === "not_connected" || code === 404 || code === 400;
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [msg, setMsg] = useState("");

  const types = (event && event.ticket_types) || [];
  const sold = types.reduce((sum, tt) => sum + (tt.quantity - tt.quantity_left), 0);
  const capacity = event ? event.capacity : 0;
  const st = eventStatus(event);
  const subtitle = event ? [shortDateTime(event.date), event.venue].filter(Boolean).join(" | ") : "";

  const cancelled = Boolean(event && event.status === "cancelled");

  async function cancelEvent(reason) {
    const r = await send(`/organizer/events/${id}/cancel`, "POST", { reason });
    setCancelling(false);
    if (r.ok) navigate("/organizer/dashboard");
    else setMsg(r.message);
  }

  async function setPublished(published) {
    setMsg("");
    const r = await send(`/events/${id}`, "PUT", {
      title: event.title, description: event.description, date: event.date, venue: event.venue,
      capacity: event.capacity, category: event.category, image_url: event.image_url,
      status: published ? "published" : "draft",
    });
    if (r.ok) setEvent({ ...event, ...r.data });
    else setMsg(r.message);
  }

  async function deleteType() {
    const tt = deleting;
    const r = await send(`/events/${id}/ticket-types/${tt.id}`, "DELETE");
    setDeleting(null);
    if (r.ok) setEvent({ ...event, ticket_types: types.filter((x) => x.id !== tt.id) });
    else setMsg(r.message);
  }

  return (
    <div className="em">
      <Navbar />

      <main className="bf-page">
        <Link to="/organizer/dashboard" className="bf-back">&lt;{t("Back to dashboard")}</Link>

        {status === "loading" && <p className="bf-muted">{t("Loading event...")}</p>}
        {(status === "error" || status === "not_connected") && (
          <p className="em-error" role="alert">{notFound ? t("Event not found.") : error}</p>
        )}

        {event && (
          <>
            <div className="em-head">
              <div>
                <div className="em-title-row">
                  <h1 className="em-title">{event.title}</h1>
                  {st && <span className={`bf-badge bf-badge-${st.key}`}>{st.label}</span>}
                </div>
                <p className="bf-muted em-sub">{subtitle}</p>
              </div>
              {!cancelled && (
                <div className="em-buttons">
                  <button type="button" className="bf-btn-danger" onClick={() => setCancelling(true)}>{t("Cancel event")}</button>
                  <Link to={`/organizer/events/${id}/edit`} className="bf-btn-outline">{t("Edit event")}</Link>
                  {event.status === "draft" && (
                    <button type="button" className="bf-btn-outline" onClick={() => setPublished(true)}>{t("Publish")}</button>
                  )}
                  {event.status === "published" && sold === 0 && (
                    <button type="button" className="bf-btn-outline" onClick={() => setPublished(false)}>{t("Unpublish")}</button>
                  )}
                  <Link to={`/organizer/events/${id}/ticket-types/new`} className="bf-btn">{t("Add ticket type")}</Link>
                </div>
              )}
            </div>
            {cancelled && (
              <p className="em-note" role="status">
                {t("This event was cancelled. Paid orders were refunded (simulated) and free registrations cancelled.")}
              </p>
            )}
            {event.status === "draft" && (
              <p className="em-note" role="status">{t("This is a draft: only you can see it. Publish it to start selling tickets.")}</p>
            )}
            {event.suspended && (
              <p className="em-error" role="alert">{t("BiletFlow suspended this event: it is hidden and sales are stopped. Contact support.")}</p>
            )}
            {msg && <p className="em-error" role="alert">{msg}</p>}
            {copyErrors.length > 0 && (
              <p className="em-error" role="alert">
                {t("Some ticket types were not copied: {errors}. Add them again with \"Add ticket type\".", { errors: copyErrors.join("; ") })}
              </p>
            )}

            <div className="bf-stats">
              <div className="bf-stat">
                <div className="bf-stat-label">{t("Capacity")}</div>
                <div className="bf-stat-value">{capacity}</div>
              </div>
              <div className="bf-stat">
                <div className="bf-stat-label">{t("Sold")}</div>
                <div className="bf-stat-value">{sold}</div>
              </div>
              <div className="bf-stat">
                <div className="bf-stat-label">{t("Remaining")}</div>
                <div className="bf-stat-value">{Math.max(capacity - sold, 0)}</div>
              </div>
              <div className="bf-stat">
                <div className="bf-stat-label">{t("Ticket types")}</div>
                <div className="bf-stat-value">{types.length}</div>
              </div>
            </div>

            <div className="bf-chips" role="tablist" aria-label={t("Event sections")}>
              {TABS.map((tt) => (
                <button
                  key={tt.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === tt.value}
                  className={tab === tt.value ? "bf-chip bf-chip-active" : "bf-chip"}
                  onClick={() => setTab(tt.value)}
                >
                  {tt.label}
                </button>
              ))}
            </div>

            {tab === "types" && (
              <div className="bf-table-wrap em-table-wrap">
                <table className="bf-table">
                  <thead>
                    <tr>
                      <th>{t("Name")}</th>
                      <th>{t("Price")}</th>
                      <th>{t("Sold")}</th>
                      <th>{t("Left")}</th>
                      <th>{t("Checked in")}</th>
                      <th>{t("Refunded / cancelled")}</th>
                      {!cancelled && <th><span className="bf-sr-only">{t("Actions")}</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {types.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="bf-muted">
                          {t("No ticket types yet.")} <Link to={`/organizer/events/${id}/ticket-types/new`}>{t("Add one")}</Link> {t("so people can register.")}
                        </td>
                      </tr>
                    ) : (
                      types.map((tt) => (
                        <tr key={tt.id}>
                          <td>
                            {tt.name}
                            {tt.hidden && <span className="bf-badge bf-badge-cancelled em-hidden">{t("Hidden")}</span>}
                            {tt.description && <span className="bf-muted em-cell-sub">{tt.description}</span>}
                            {(tt.sales_starts_at || tt.sales_ends_at) && (
                              <span className="bf-muted em-cell-sub">
                                {t("Sales: {from} to {to}", {
                                  from: tt.sales_starts_at ? shortDateTime(tt.sales_starts_at) : "...",
                                  to: tt.sales_ends_at ? shortDateTime(tt.sales_ends_at) : "...",
                                })}
                              </span>
                            )}
                            {tt.max_per_order && (
                              <span className="bf-muted em-cell-sub">{t("Up to {n} per order", { n: tt.max_per_order })}</span>
                            )}
                          </td>
                          <td>{kzt(tt.price)}</td>
                          <td>{tt.quantity - tt.quantity_left}</td>
                          <td>{tt.quantity_left}</td>
                          <td>{counts[tt.name] ? counts[tt.name].checkedIn : 0}</td>
                          <td>{counts[tt.name] ? counts[tt.name].returned : 0}</td>
                          {!cancelled && (
                            <td className="em-row-actions">
                              <Link to={`/organizer/events/${id}/ticket-types/${tt.id}/edit`} className="em-link">{t("Edit")}</Link>
                              {tt.quantity === tt.quantity_left && (
                                <button type="button" className="em-link" onClick={() => setDeleting(tt)}>{t("Delete")}</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "attendees" && <AttendeesSection eventId={id} list={attendeeList} />}
            {tab === "staff" && <StaffSection eventId={id} />}

            <nav className="em-foot" aria-label={t("More for this event")}>
              <Link to={`/organizer/events/${id}/orders`}>{t("Orders and refunds")}&gt;</Link>
              <Link to={`/organizer/events/${id}/activation`}>{t("Paid sales activation")}&gt;</Link>
              <Link to={`/organizer/events/${id}/analytics`}>{t("Analytics")}&gt;</Link>
              <Link to={`/organizer/events/${id}/history`}>{t("History")}&gt;</Link>
              <Link to={`/events/${id}`}>{t("View public page")}&gt;</Link>
            </nav>
          </>
        )}
      </main>

      {deleting && (
        <ConfirmDialog
          title={t("Delete \"{name}\"?", { name: deleting.name })}
          message={t("Nobody has this ticket type yet, so it can be deleted.")}
          confirmLabel={t("Delete")}
          danger
          onConfirm={deleteType}
          onCancel={() => setDeleting(null)}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title={t("Cancel this event?")}
          message={t("The event will be marked as cancelled, ticket sales stop, and attendees are notified. This cannot be undone.")}
          confirmLabel={t("Cancel event")}
          danger
          needsReason
          onConfirm={cancelEvent}
          onCancel={() => setCancelling(false)}
        />
      )}
    </div>
  );
}

export default EventManagement;
