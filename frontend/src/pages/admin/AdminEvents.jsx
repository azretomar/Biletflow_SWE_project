import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAdminData, eventDisplayStatus, formatDateTime } from "./AdminDataContext";
import { StatusBadge, ConfirmDialog } from "./AdminComponents";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "reported", label: "Reported" },
];

// Screen 2: Events list - search, filter by status, suspend.
function AdminEvents() {
  const { events, getUser, setEventSuspended } = useAdminData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(null); // the event we are about to suspend/restore

  const filter = searchParams.get("filter") || "all";

  const visibleEvents = events.filter((e) => {
    const organizer = getUser(e.organizer_id);
    const text = (e.title + " " + (organizer ? organizer.full_name + " " + organizer.email : "")).toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;

    if (filter === "all") return true;
    if (filter === "reported") return e.reports.length > 0;
    return eventDisplayStatus(e) === filter;
  });

  function confirmAction() {
    setEventSuspended(confirming.id, !confirming.suspended);
    setConfirming(null);
  }

  return (
    <div className="admin-page">
      <h1>Events</h1>

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search by event title or organizer..."
          aria-label="Search events"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-tabs" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={filter === f.value ? "filter-tab active" : "filter-tab"}
              aria-pressed={filter === f.value}
              onClick={() => setSearchParams(f.value === "all" ? {} : { filter: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        {visibleEvents.length === 0 ? (
          <p className="empty">{events.length === 0 ? "No events yet." : "No events match your search."}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Organizer</th>
                <th>Date</th>
                <th>Sold</th>
                <th>Reports</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={"/admin/events/" + e.id}>{e.title}</Link>
                    <div className="cell-sub">{e.venue}</div>
                  </td>
                  <td>{getUser(e.organizer_id)?.full_name}</td>
                  <td className="nowrap">{formatDateTime(e.start_at)}</td>
                  <td className="nowrap">{e.tickets_sold} / {e.capacity}</td>
                  <td>{e.reports.length > 0 ? <strong className="text-danger">{e.reports.length}</strong> : "0"}</td>
                  <td><StatusBadge status={eventDisplayStatus(e)} /></td>
                  <td className="actions">
                    {e.suspended ? (
                      <button type="button" className="btn-small btn-secondary" onClick={() => setConfirming(e)}>
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-small btn-danger"
                        disabled={e.status === "cancelled"}
                        onClick={() => setConfirming(e)}
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={confirming.suspended ? "Restore event?" : "Suspend event?"}
          message={
            confirming.suspended
              ? `"${confirming.title}" will be visible again. Paid sales stay stopped until you turn them back on.`
              : `"${confirming.title}" will be hidden from attendees and all ticket sales will stop.`
          }
          confirmLabel={confirming.suspended ? "Restore" : "Suspend event"}
          danger={!confirming.suspended}
          needsReason
          onConfirm={confirmAction}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default AdminEvents;
