import { useState } from "react";
import { useAdminData, formatDate } from "./AdminDataContext";
import { StatusBadge, ConfirmDialog } from "./AdminComponents";

const ROLE_FILTERS = ["all", "attendee", "organizer", "admin"];

// Screen 4: Users list - search by name/email, see the role, suspend/unsuspend.
function AdminUsers() {
  const { users, events, setUserSuspended } = useAdminData();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [confirming, setConfirming] = useState(null);

  const visibleUsers = users.filter((u) => {
    const text = (u.full_name + " " + u.email).toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;
    return role === "all" || u.role === role;
  });

  function eventCount(userId) {
    return events.filter((e) => e.organizer_id === userId).length;
  }

  return (
    <div className="admin-page">
      <h1>Users</h1>

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search by name or email..."
          aria-label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-tabs" role="group" aria-label="Filter by role">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              className={role === r ? "filter-tab active" : "filter-tab"}
              aria-pressed={role === r}
              onClick={() => setRole(r)}
            >
              {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1) + "s"}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        {visibleUsers.length === 0 ? (
          <p className="empty">{users.length === 0 ? "No users yet." : "No users match your search."}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Events</th>
                <th>Joined</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td><span className={"role-tag role-" + u.role}>{u.role}</span></td>
                  <td>{u.role === "organizer" ? eventCount(u.id) : "—"}</td>
                  <td className="nowrap">{formatDate(u.created_at)}</td>
                  <td><StatusBadge status={u.suspended ? "suspended" : "active"} /></td>
                  <td className="actions">
                    {u.role === "admin" ? null : u.suspended ? (
                      <button type="button" className="btn-small btn-secondary" onClick={() => setConfirming(u)}>
                        Unsuspend
                      </button>
                    ) : (
                      <button type="button" className="btn-small btn-danger" onClick={() => setConfirming(u)}>
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
          title={confirming.suspended ? "Unsuspend user?" : "Suspend user?"}
          message={
            confirming.suspended
              ? `${confirming.full_name} will be able to log in again.`
              : `${confirming.full_name} will not be able to log in.` +
                (confirming.role === "organizer" ? " Their events are not suspended automatically." : "")
          }
          confirmLabel={confirming.suspended ? "Unsuspend" : "Suspend user"}
          danger={!confirming.suspended}
          needsReason
          onConfirm={() => {
            setUserSuspended(confirming.id, !confirming.suspended);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default AdminUsers;
