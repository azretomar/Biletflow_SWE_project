import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useApi, send, statusNote } from "../../lib/useApi";
import { kzt, shortDateTime } from "../../lib/format";
import "./eventManagement.css";

// Event management for the organizer.
//   GET    /api/events/{id}                  event + ticket types (sold = quantity - quantity_left)
//   PUT    /api/events/{id}                  (used here only to publish a draft)
//   DELETE /api/events/{id}/ticket-types/{typeId}  (only while none of its tickets were issued)
//   GET    /api/events/{id}/staff            check-in staff
//   POST   /api/events/{id}/staff            { email }  (the person must have an account)
//   DELETE /api/events/{id}/staff/{userId}
//   GET    /api/organizer/events/{id}/attendees -> [{ ticket_id, full_name, email, ticket_type, status, checked_in_at }]
//   Planned (frontend ready, backend not built yet; see docs/api.md):
//   POST   /api/checkin/undo { event_id, ticket_id }  (undo an accidental check-in, SRS 4.8)
//   POST   /api/organizer/events/{id}/cancel    { reason }
//   (orders and refunds: see the Orders and refunds page)

const TABS = [
  { value: "types", label: "Ticket types" },
  { value: "attendees", label: "Attendees" },
  { value: "staff", label: "Check-in staff" },
];

const TICKET_STATUS = {
  valid: { label: "Valid", cls: "bf-badge-valid" },
  checked_in: { label: "Checked in", cls: "bf-badge-checkedin" },
  cancelled: { label: "Cancelled", cls: "bf-badge-cancelled" },
  refunded: { label: "Refunded", cls: "bf-badge-refunded" },
};

function eventStatus(ev) {
  if (!ev || !ev.date) return null;
  if (ev.status === "cancelled") return { key: "cancelled", label: "Cancelled" };
  if (ev.status === "draft") return { key: "draft", label: "Draft" };
  const start = new Date(ev.date);
  const now = new Date();
  if (start > now) return { key: "upcoming", label: "Upcoming" };
  if (now - start < 12 * 60 * 60 * 1000) return { key: "active", label: "Active" };
  return { key: "completed", label: "Completed" };
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
      setMsg("Enter the email the person signed up with.");
      return;
    }
    setBusy(true);
    const r = await send(`/events/${eventId}/staff`, "POST", { email: email.trim() });
    setBusy(false);
    if (r.ok) {
      setData([...staff, r.data]);
      setEmail("");
      setMsg(`${r.data.full_name || r.data.email} can now check in tickets for this event in the mobile app.`);
    } else {
      setMsg(r.message);
    }
  }

  async function remove() {
    const m = removing;
    const r = await send(`/events/${eventId}/staff/${m.user_id}`, "DELETE");
    if (r.ok) setData(staff.filter((s) => s.user_id !== m.user_id));
    setMsg(r.ok ? `${m.full_name || m.email} was removed from check-in staff.` : r.message);
    setRemoving(null);
  }

  const note = statusNote(status, error);

  return (
    <div className="em-staff">
      <p className="bf-muted em-staff-intro">
        Check-in staff use the BiletFlow mobile app to scan tickets at the door. They only see this event.
        The person needs a BiletFlow account first.
      </p>
      <form className="em-staff-form" onSubmit={add}>
        <label className="bf-sr-only" htmlFor="staff-email">Staff email</label>
        <input id="staff-email" type="email" className="bf-input" placeholder="staff@example.kz"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="bf-btn" disabled={busy}>{busy ? "Adding..." : "Add staff"}</button>
      </form>
      {msg && <p className="em-msg" role="status">{msg}</p>}
      {note && <p className="bf-muted em-note" role="status">{note}</p>}

      <div className="bf-table-wrap em-table-wrap">
        <table className="bf-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Added</th>
              <th><span className="bf-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={4} className="bf-muted">No check-in staff yet.</td></tr>
            ) : (
              staff.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.full_name || "-"}</td>
                  <td>{m.email}</td>
                  <td>{shortDateTime(m.assigned_at)}</td>
                  <td className="em-actions-cell">
                    <button type="button" className="em-link" onClick={() => setRemoving(m)}>Remove</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {removing && (
        <ConfirmDialog
          title="Remove from check-in staff?"
          message={`${removing.full_name || removing.email} will no longer be able to check in tickets for this event.`}
          confirmLabel="Remove"
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
  const [undoing, setUndoing] = useState(null); // attendee whose check-in to undo
  const [msg, setMsg] = useState("");
  const note = statusNote(status, error);

  async function undo() {
    const a = undoing;
    setUndoing(null);
    const r = await send("/checkin/undo", "POST", { event_id: eventId, ticket_id: a.ticket_id });
    if (r.ok) {
      setData(attendees.map((x) => (x.ticket_id === a.ticket_id ? { ...x, status: "valid", checked_in_at: null } : x)));
      setMsg(`Check-in undone for ${a.full_name}. The ticket can be scanned again.`);
    } else {
      setMsg(r.message);
    }
  }
  const visible = attendees.filter((a) =>
    !search || (a.full_name + " " + a.email + " " + a.ticket_id).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <input type="search" className="bf-input em-search" placeholder="Search attendees by name, email or ticket"
        aria-label="Search attendees" value={search} onChange={(e) => setSearch(e.target.value)} />
      {note && <p className="bf-muted em-note" role="status">{note}</p>}
      {msg && <p className="em-msg" role="status">{msg}</p>}
      <div className="bf-table-wrap em-table-wrap">
        <table className="bf-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Ticket type</th>
              <th>Ticket ID</th>
              <th>Status</th>
              <th><span className="bf-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={6} className="bf-muted">{attendees.length === 0 ? "No attendees yet." : "No attendees match your search."}</td></tr>
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
                        <button type="button" className="em-link" onClick={() => setUndoing(a)}>Undo check-in</button>
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
          title="Undo this check-in?"
          message={`${undoing.full_name}'s ticket becomes valid again and can be scanned at the door. Use this only for a check-in made by mistake.`}
          confirmLabel="Undo check-in"
          onConfirm={undo}
          onCancel={() => setUndoing(null)}
        />
      )}
    </>
  );
}

// Per ticket type: how many tickets are checked in and how many were refunded or cancelled.
// Keyed by ticket type name, which the attendee list gives for every ticket.
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
  // After "Duplicate event": ticket types that could not be copied (e.g. capacity was lowered).
  const copyErrors = (location.state && location.state.copyErrors) || [];
  const counts = countByType(attendeeList.data);
  const notFound = status === "not_connected" || code === 404 || code === 400;
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(null); // ticket type to delete
  const [msg, setMsg] = useState("");

  const types = (event && event.ticket_types) || [];
  const sold = types.reduce((sum, t) => sum + (t.quantity - t.quantity_left), 0);
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

  // Publish a draft, or take a published event back to draft while nobody has a ticket (SRS 4.2).
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
    const t = deleting;
    const r = await send(`/events/${id}/ticket-types/${t.id}`, "DELETE");
    setDeleting(null);
    if (r.ok) setEvent({ ...event, ticket_types: types.filter((x) => x.id !== t.id) });
    else setMsg(r.message);
  }

  return (
    <div className="em">
      <Navbar />

      <main className="bf-page">
        <Link to="/organizer/dashboard" className="bf-back">&lt;Back to dashboard</Link>

        {status === "loading" && <p className="bf-muted">Loading event...</p>}
        {(status === "error" || status === "not_connected") && (
          <p className="em-error" role="alert">{notFound ? "Event not found." : error}</p>
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
                  <button type="button" className="bf-btn-danger" onClick={() => setCancelling(true)}>Cancel event</button>
                  <Link to={`/organizer/events/${id}/edit`} className="bf-btn-outline">Edit event</Link>
                  {event.status === "draft" && (
                    <button type="button" className="bf-btn-outline" onClick={() => setPublished(true)}>Publish</button>
                  )}
                  {event.status === "published" && sold === 0 && (
                    <button type="button" className="bf-btn-outline" onClick={() => setPublished(false)}>Unpublish</button>
                  )}
                  <Link to={`/organizer/events/${id}/ticket-types/new`} className="bf-btn">Add ticket type</Link>
                </div>
              )}
            </div>
            {cancelled && (
              <p className="em-note" role="status">
                This event was cancelled. Paid orders were refunded (simulated) and free registrations cancelled.
              </p>
            )}
            {event.status === "draft" && (
              <p className="em-note" role="status">This is a draft: only you can see it. Publish it to start selling tickets.</p>
            )}
            {event.suspended && (
              <p className="em-error" role="alert">BiletFlow suspended this event: it is hidden and sales are stopped. Contact support.</p>
            )}
            {msg && <p className="em-error" role="alert">{msg}</p>}
            {copyErrors.length > 0 && (
              <p className="em-error" role="alert">
                Some ticket types were not copied: {copyErrors.join("; ")}. Add them again with "Add ticket type".
              </p>
            )}

            <div className="bf-stats">
              <div className="bf-stat">
                <div className="bf-stat-label">Capacity</div>
                <div className="bf-stat-value">{capacity}</div>
              </div>
              <div className="bf-stat">
                <div className="bf-stat-label">Sold</div>
                <div className="bf-stat-value">{sold}</div>
              </div>
              <div className="bf-stat">
                <div className="bf-stat-label">Remaining</div>
                <div className="bf-stat-value">{Math.max(capacity - sold, 0)}</div>
              </div>
              <div className="bf-stat">
                <div className="bf-stat-label">Ticket types</div>
                <div className="bf-stat-value">{types.length}</div>
              </div>
            </div>

            <div className="bf-chips" role="tablist" aria-label="Event sections">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  className={tab === t.value ? "bf-chip bf-chip-active" : "bf-chip"}
                  onClick={() => setTab(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "types" && (
              <div className="bf-table-wrap em-table-wrap">
                <table className="bf-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Sold</th>
                      <th>Left</th>
                      <th>Checked in</th>
                      <th>Refunded / cancelled</th>
                      {!cancelled && <th><span className="bf-sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {types.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="bf-muted">
                          No ticket types yet. <Link to={`/organizer/events/${id}/ticket-types/new`}>Add one</Link> so people can register.
                        </td>
                      </tr>
                    ) : (
                      types.map((t) => (
                        <tr key={t.id}>
                          <td>
                            {t.name}
                            {t.description && <span className="bf-muted em-cell-sub">{t.description}</span>}
                          </td>
                          <td>{kzt(t.price)}</td>
                          <td>{t.quantity - t.quantity_left}</td>
                          <td>{t.quantity_left}</td>
                          <td>{counts[t.name] ? counts[t.name].checkedIn : 0}</td>
                          <td>{counts[t.name] ? counts[t.name].returned : 0}</td>
                          {!cancelled && (
                            <td className="em-row-actions">
                              <Link to={`/organizer/events/${id}/ticket-types/${t.id}/edit`} className="em-link">Edit</Link>
                              {t.quantity === t.quantity_left && (
                                <button type="button" className="em-link" onClick={() => setDeleting(t)}>Delete</button>
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

            <nav className="em-foot" aria-label="More for this event">
              <Link to={`/organizer/events/${id}/orders`}>Orders and refunds&gt;</Link>
              <Link to={`/organizer/events/${id}/activation`}>Paid sales activation&gt;</Link>
              <Link to={`/organizer/events/${id}/analytics`}>Analytics&gt;</Link>
              <Link to={`/organizer/events/${id}/history`}>History&gt;</Link>
              <Link to={`/events/${id}`}>View public page&gt;</Link>
            </nav>
          </>
        )}
      </main>

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message="Nobody has this ticket type yet, so it can be deleted."
          confirmLabel="Delete"
          danger
          onConfirm={deleteType}
          onCancel={() => setDeleting(null)}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title="Cancel this event?"
          message="The event will be marked as cancelled, ticket sales stop, and attendees are notified. This cannot be undone."
          confirmLabel="Cancel event"
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
