// Small display helpers shared by several pages.

export function kzt(amount) {
  const n = Number(amount) || 0;
  return n === 0 ? "Free" : n.toLocaleString("en-US") + " ₸";
}

export function shortDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

// Order status -> label and shared.css badge class (text is always shown, not only colour).
export const ORDER_STATUS = {
  paid: { label: "Paid", badge: "bf-badge-valid" },
  free: { label: "Free registration", badge: "bf-badge-valid" },
  failed: { label: "Payment failed", badge: "bf-badge-cancelled" },
  cancelled: { label: "Cancelled", badge: "bf-badge-cancelled" },
  refunded: { label: "Refunded", badge: "bf-badge-refunded" },
};

// Support case status (SRS 4.13).
export const CASE_STATUS = {
  open: { label: "Open", badge: "bf-badge-upcoming" },
  in_progress: { label: "In progress", badge: "bf-badge-active" },
  waiting: { label: "Waiting for customer", badge: "bf-badge-completed" },
  resolved: { label: "Resolved", badge: "bf-badge-valid" },
};
