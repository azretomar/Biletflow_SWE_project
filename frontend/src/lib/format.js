import { locale, t } from "../i18n";

export function number(n) {
  return (Number(n) || 0).toLocaleString(locale());
}

export function kzt(amount) {
  const n = Number(amount) || 0;
  return n === 0 ? t("Free") : number(n) + " ₸";
}

export function shortDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return (
    d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
  );
}

export const ORDER_STATUS = {
  paid: { get label() { return t("Paid"); }, badge: "bf-badge-valid" },
  free: { get label() { return t("Free registration"); }, badge: "bf-badge-valid" },
  failed: { get label() { return t("Payment failed"); }, badge: "bf-badge-cancelled" },
  cancelled: { get label() { return t("Cancelled"); }, badge: "bf-badge-cancelled" },
  refunded: { get label() { return t("Refunded"); }, badge: "bf-badge-refunded" },
};

export const CASE_STATUS = {
  open: { get label() { return t("Open"); }, badge: "bf-badge-upcoming" },
  in_progress: { get label() { return t("In progress"); }, badge: "bf-badge-active" },
  waiting: { get label() { return t("Waiting for customer"); }, badge: "bf-badge-completed" },
  resolved: { get label() { return t("Resolved"); }, badge: "bf-badge-valid" },
};
