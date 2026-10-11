import { createContext, useContext, useState } from "react";

// This "context" keeps the admin data in one place, so every admin page
// sees the same users and events. When you suspend an event on one page,
// the other pages see the change too.
//
// The lists start empty. When the backend admin API is ready, load the
// users and events here (e.g. GET /api/admin/users, GET /api/admin/events),
// and make the functions below (setEventSuspended, setUserSuspended, ...)
// call the backend too. For now they only change the data in memory.

const AdminDataContext = createContext(null);

export function AdminDataProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);

  function getUser(id) {
    return users.find((u) => u.id === id);
  }

  function getEvent(id) {
    return events.find((e) => e.id === id);
  }

  function updateEvent(id, changes) {
    setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }

  function setEventSuspended(id, suspended) {
    const event = getEvent(id);
    const changes = { suspended };
    // Suspending an event also stops its paid sales (SRS 4.5 / 4.12).
    if (suspended && event.activation && event.activation.paid_sales === "active") {
      changes.activation = { ...event.activation, paid_sales: "stopped" };
    }
    updateEvent(id, changes);
  }

  function setPaidSalesStopped(id, stopped) {
    const event = getEvent(id);
    updateEvent(id, {
      activation: { ...event.activation, paid_sales: stopped ? "stopped" : "active" },
    });
  }

  function setUserSuspended(id, suspended) {
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, suspended } : u)));
  }

  const value = {
    users,
    events,
    failedPayments: 0,
    getUser,
    getEvent,
    setEventSuspended,
    setPaidSalesStopped,
    setUserSuspended,
  };

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  return useContext(AdminDataContext);
}

// ---- Small helpers used by several admin pages ----

export function formatKzt(amount) {
  return amount.toLocaleString("en-US") + " ₸";
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString("en-GB", {
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
