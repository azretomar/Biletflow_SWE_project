import { useState } from "react";
import { useAdminData, formatDate } from "./AdminDataContext";
import { StatusBadge, ConfirmDialog } from "./AdminComponents";
import { downloadCsv, today } from "../../lib/csv";
import { roleName, t } from "../../i18n";

const ROLE_FILTERS = ["all", "attendee", "organizer", "admin"];
const ROLE_FILTER_LABELS = {
  get all() { return t("All"); },
  get attendee() { return t("Attendees"); },
  get organizer() { return t("Organizers"); },
  get admin() { return t("Admins"); },
};

function AdminUsers() {
  const { users, events, setUserSuspended } = useAdminData();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [confirming, setConfirming] = useState(null);

  const visibleUsers = users.filter((u) => {
    const text = (u.full_name + " " + u.email).toLowerCase();
    if (search && !text.includes(search.toLowerCase())) return false;
    if (role === "admin") return u.role === "platform_admin" || u.role === "event_admin";
    return role === "all" || u.role === role;
  });

  function eventCount(userId) {
    return events.filter((e) => e.organizer_id === userId).length;
  }

  return (
    <div className="admin-page">
      <h1>{t("Users")}</h1>

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder={t("Search by name or email...")}
          aria-label={t("Search users")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-tabs" role="group" aria-label={t("Filter by role")}>
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              className={role === r ? "filter-tab active" : "filter-tab"}
              aria-pressed={role === r}
              onClick={() => setRole(r)}
            >
              {ROLE_FILTER_LABELS[r]}
            </button>
          ))}
        </div>
        <button type="button" className="btn-small btn-secondary" disabled={visibleUsers.length === 0}
          onClick={() => downloadCsv(`biletflow-users-${today()}.csv`, [
            { label: t("Name"), value: (u) => u.full_name },
            { label: t("Email"), value: (u) => u.email },
            { label: t("Role"), value: (u) => u.role },
            { label: t("Suspended"), value: (u) => (u.suspended ? "yes" : "no") },
            { label: t("Events organized"), value: (u) => eventCount(u.id) },
            { label: t("Joined"), value: (u) => u.created_at },
          ], visibleUsers)}>
          {t("Export CSV")}
        </button>
      </div>

      <div className="panel">
        {visibleUsers.length === 0 ? (
          <p className="empty">{users.length === 0 ? t("No users yet.") : t("No users match your search.")}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Email")}</th>
                <th>{t("Role")}</th>
                <th>{t("Events")}</th>
                <th>{t("Joined")}</th>
                <th>{t("Status")}</th>
                <th><span className="sr-only">{t("Actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td><span className={"role-tag role-" + u.role}>{roleName(u.role)}</span></td>
                  <td>{u.role === "organizer" ? eventCount(u.id) : "—"}</td>
                  <td className="nowrap">{formatDate(u.created_at)}</td>
                  <td><StatusBadge status={u.suspended ? "suspended" : "active"} /></td>
                  <td className="actions">
                    {u.role === "admin" ? null : u.suspended ? (
                      <button type="button" className="btn-small btn-secondary" onClick={() => setConfirming(u)}>
                        {t("Unsuspend")}
                      </button>
                    ) : (
                      <button type="button" className="btn-small btn-danger" onClick={() => setConfirming(u)}>
                        {t("Suspend")}
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
          title={confirming.suspended ? t("Unsuspend user?") : t("Suspend user?")}
          message={
            confirming.suspended
              ? t("{name} will be able to log in again.", { name: confirming.full_name })
              : t("{name} will not be able to log in.", { name: confirming.full_name }) +
                (confirming.role === "organizer" ? " " + t("Their events are not suspended automatically.") : "")
          }
          confirmLabel={confirming.suspended ? t("Unsuspend") : t("Suspend user")}
          danger={!confirming.suspended}
          needsReason
          onConfirm={(reason) => {
            setUserSuspended(confirming.id, !confirming.suspended, reason);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default AdminUsers;
