import { createContext, useContext, useState } from "react";
import { useApi, send, statusNote } from "../../lib/useApi";
import { locale } from "../../i18n";

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

export function eventDisplayStatus(event) {
  return event.suspended ? "suspended" : event.status;
}

export function checklistDone(activation) {
  return (
    activation.identity_verified &&
    activation.fee_paid &&
    activation.payout_account &&
    activation.terms_accepted
  );
}
