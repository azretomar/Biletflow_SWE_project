import { enPlural } from "./plural";

const en = {
  "{n} events found": ({ n }) => `${n} ${enPlural(n, "event", "events")} found`,
  "{n} tickets": ({ n }) => `${n} ${enPlural(n, "ticket", "tickets")}`,
  "Continue with {n} tickets": ({ n }) => `Continue with ${n} ${enPlural(n, "ticket", "tickets")}`,
  "{n} organizers": ({ n }) => `${n} ${enPlural(n, "organizer", "organizers")}`,
  "{n} places": ({ n }) => `${n} ${enPlural(n, "place", "places")}`,
  "{n} tickets were already issued, so the price stays the same and the quantity cannot go below {n}.": ({ n }) =>
    `${n} ${enPlural(n, "ticket was", "tickets were")} already issued, so the price stays the same and the quantity cannot go below ${n}.`,
  "Its {n} ticket types ({names}) will be added with nothing sold.": ({ n, names }) =>
    `Its ${n} ${enPlural(n, "ticket type", "ticket types")} (${names}) will be added with nothing sold.`,
  "{date}: {n} tickets, {amount}": ({ date, n, amount }) => `${date}: ${n} ${enPlural(n, "ticket", "tickets")}, ${amount}`,
  "Tickets sold per day: {total} tickets over {days} days, highest {max} in one day.": ({ total, days, max }) =>
    `Tickets sold per day: ${total} ${enPlural(total, "ticket", "tickets")} over ${days} ${enPlural(days, "day", "days")}, highest ${max} in one day.`,
};

export default en;
