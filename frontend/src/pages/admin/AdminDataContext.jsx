import { createContext, useContext, useState } from "react";
import { useApi, send, statusNote } from "../../lib/useApi";
import { locale } from "../../i18n";

// This "context" keeps the admin data in one place, so every admin page
// sees the same users and events. When you suspend an event on one page,
// the other pages see the change too.
//
// Backend (docs/api.md, platform_admin only; every action is written to the audit log with its reason):
//   GET  /api/admin/users  -> [{ id, full_name, email, role, suspended, created_at }]
//   GET  /api/admin/events -> [{ id, title, organizer_id, category, venue, start_at, status, suspended,
//                                capacity, tickets_sold, revenue_kzt,
//                                reports: [{ id, reason, reporter, created_at }],
//                                activation: null | { paid_sales: "pending" | "active" | "stopped",
//                                  identity_verified, fee_paid, payout_account, terms_accepted, requested_at } }]
//   GET  /api/admin/stats  -> { failed_payments_7d }
//   POST /api/admin/users/{id}/suspend | /unsuspend          { reason }
//   POST /api/admin/events/{id}/suspend | /restore           { reason }   (suspend also stops paid sales)
//   POST /api/admin/events/{id}/stop-sales | /resume-sales   { reason }
// The lists stay empty with a short note until the endpoints exist. A change is shown only
// after the server accepts it.

const AdminDataContext = createContext(null);

export function AdminDataProvider({ children }) {
  const usersReq = useApi("/admin/users", []);
  const eventsReq = useApi("/admin/events", []);
  const statsReq = useApi("/admin/stats", { failed_payments_7d: 0 });
  const [notice, setNotice] = useState("");

  const users = usersReq.data || [];
  const events = eventsReq.data || [];

  function getUser(id) {
    return users.find((u) => u.id === id);
  }

  function getEvent(id) {
    return events.find((e) => e.id === id);
  }

  function updateEvent(id, changes) {
    eventsReq.setData((list) => (list || []).map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }

  // Sends one admin action; changes the screen only when the server says OK.
  async function act(path, reason, apply) {
    setNotice("");
    const r = await send(path, "POST", { reason: reason || "" });
    if (r.ok) apply();
    else setNotice(r.message);
    return r;
  }

  function setEventSuspended(id, suspended, reason) {
    const event = getEvent(id);
    return act(`/admin/events/${id}/${suspended ? "suspend" : "restore"}`, reason, () => {
      const changes = { suspended };
      // Suspending an event also stops its paid sales (SRS 4.5 / 4.12).
      if (suspended && event && event.activation && event.activation.paid_sales === "active") {
        changes.activation = { ...event.activation, paid_sales: "stopped" };
      }
      updateEvent(id, changes);
    });
  }

  function setPaidSalesStopped(id, stopped, reason) {
    const event = getEvent(id);
    return act(`/admin/events/${id}/${stopped ? "stop-sales" : "resume-sales"}`, reason, () =>
      updateEvent(id, { activation: { ...(event && event.activation), paid_sales: stopped ? "stopped" : "active" } })
    );
  }

  function setUserSuspended(id, suspended, reason) {
    return act(`/admin/users/${id}/${suspended ? "suspend" : "unsuspend"}`, reason, () =>
      usersReq.setData((list) => (list || []).map((u) => (u.id === id ? { ...u, suspended } : u)))
    );
  }

  // One short line for the admin pages: loading, not connected, or the last failed action.
  const loadNote = statusNote(eventsReq.status, eventsReq.error) || statusNote(usersReq.status, usersReq.error);

  const value = {
    users,
    events,
    failedPayments: (statsReq.data && statsReq.data.failed_payments_7d) || 0,
    getUser,
    getEvent,
    setEventSuspended,
    setPaidSalesStopped,
    setUserSuspended,
    notice: notice || loadNote,
    clearNotice: () => setNotice(""),
  };

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  return useContext(AdminDataContext);
}

// ---- Small helpers used by several admin pages ----

export function formatKzt(amount) {
  return amount.toLocaleString(locale()) + " ₸";
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString(locale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString(locale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// The status an admin sees: "suspended" wins over the normal status.
export function eventDisplayStatus(event) {
  return event.suspended ? "suspended" : event.status;
}

// Is every item of the paid-sales checklist done? (SRS 3.2)
export function checklistDone(activation) {
  return (
    activation.identity_verified &&
    activation.fee_paid &&
    activation.payout_account &&
    activation.terms_accepted
  );
}
