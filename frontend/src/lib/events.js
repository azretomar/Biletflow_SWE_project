// Client-side filtering of the public event list (GET /api/events returns all events).
import { t } from "../i18n";
import { shortDateTime } from "./format";

// label is a getter so it is read in the current language.
export const CATEGORY_OPTIONS = [
  { value: "music", get label() { return t("Music"); } },
  { value: "education", get label() { return t("Education"); } },
  { value: "sports", get label() { return t("Sports"); } },
  { value: "other", get label() { return t("Other"); } },
];

// Sale period of one ticket type (SRS 4.3), the same check as saleBlocked() in
// backend/tickets.go. Returns why it cannot be bought right now, or "" when it can.
export function saleNote(tt, now = Date.now()) {
  if (tt.sales_starts_at && now < new Date(tt.sales_starts_at).getTime()) {
    return t("Sales start {date}", { date: shortDateTime(tt.sales_starts_at) });
  }
  if (tt.sales_ends_at && now >= new Date(tt.sales_ends_at).getTime()) return t("Sales ended");
  return "";
}

// The most tickets of this type one order may hold: the order limit, the tickets left,
// and the organizer's own max per order for this type.
export function maxPerOrder(tt, orderLimit) {
  return Math.max(0, Math.min(orderLimit, tt.quantity_left, tt.max_per_order || orderLimit));
}

// "music" -> "Music" in the current language (unknown codes are shown as they are).
export function categoryName(code) {
  const c = CATEGORY_OPTIONS.find((x) => x.value === code);
  return c ? c.label : code;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// date: "" (from today on) | "today" | "week" (next 7 days) | "month" (this calendar month)
//       | "past" (before today) | "all" (any date)
export function filterEvents(events, { search = "", category = "", date = "" }, now = new Date()) {
  const q = search.trim().toLowerCase();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return events.filter((ev) => {
    if (q && !`${ev.title} ${ev.venue} ${ev.description || ""} ${ev.organizer_name || ""}`.toLowerCase().includes(q)) return false;
    if (category && ev.category !== category) return false;
    if (date !== "all") {
      const d = new Date(ev.date);
      if (Number.isNaN(d.getTime())) return false;
      if (date === "past") return d < startOfToday;
      if (d < startOfToday) return false; // past events are hidden unless asked for
      if (date === "today" && !sameDay(d, now)) return false;
      if (date === "week") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (d < start || d >= end) return false;
      }
      if (date === "month" && (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth())) return false;
    }
    return true;
  });
}

// Upcoming first; past events at the end.
export function sortUpcoming(events, now = new Date()) {
  return [...events].sort((a, b) => {
    const da = new Date(a.date), db = new Date(b.date);
    const pa = da < now, pb = db < now;
    if (pa !== pb) return pa ? 1 : -1;
    return pa ? db - da : da - db;
  });
}
