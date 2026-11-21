# BiletFlow API

Every endpoint the website uses. All paths start with `/api`. Send `Authorization: Bearer <token>`
(from sign up or log in) where a role is listed. Amounts are whole KZT. Times are ISO 8601; forms may
also send `2026-12-01T19:00` or `2026-12-01`, which the server reads as Kazakhstan time (UTC+5).
Errors always look like `{ "error": "message for people" }`.

Payments, identity checks and payouts are **simulated** (SRS 8): no real money moves.
Emails (verify email, reset password, refunds, cancellations) are written to the backend log
(`docker compose logs backend`) until a mail service is added; the links in them work.

| Role | Who |
|---|---|
| anyone | no login needed |
| user | any logged-in account |
| organizer | `organizer` role; "own event" means an event they created |
| platform_admin | BiletFlow staff; every action needs a `reason` and goes to the audit log |

## Account

| Method and path | Role | Body / answer |
|---|---|---|
| `POST /auth/signup` | anyone | `{ email, password, full_name, role: attendee\|organizer }` -> `{ token, user }`; sends a verification email |
| `POST /auth/login` | anyone | `{ email, password }` -> `{ token, user }`; suspended accounts get 403 |
| `GET /me` | user | the user |
| `POST /auth/verify-email` | anyone | `{ token }` from the email link `/verify-email?token=...` |
| `POST /auth/resend-verification` | user | sends a new link |
| `POST /auth/forgot-password` | anyone | `{ email }`, always 200 (does not reveal which emails exist); link valid 1 hour |
| `POST /auth/reset-password` | anyone | `{ token, password }` (8-72 characters); a link works once |

## Events

| Method and path | Role | Notes |
|---|---|---|
| `GET /events` | anyone | published, public, not suspended events, with `min_price` |
| `GET /events/{id}` | anyone | event + `ticket_types`. Drafts, private and suspended events: only their organizer and admins (private: also ticket holders). Cancelled events stay visible with `status: "cancelled"` |
| `POST /events` | organizer | `{ title, description, date, venue, capacity, category: music\|education\|sports\|other, image_url, registration_closes_at, status: draft\|published, visibility: public\|unlisted\|private, ends_at, registration_opens_at, venue_address }` |
| `PUT /events/{id}` | organizer, own | same fields; fields left out keep their value. Capacity cannot go below the tickets offered; an event with issued tickets cannot go back to draft; cancelled events cannot be edited |
| `POST /events/{id}/ticket-types` | organizer, own | `{ name, description, price, quantity }`; all types together must fit in the capacity |
| `PUT /events/{id}/ticket-types/{typeId}` | organizer, own | same; price fixed once tickets were issued; quantity >= issued |
| `DELETE /events/{id}/ticket-types/{typeId}` | organizer, own | only while none of its tickets were issued |
| `POST /events/{id}/report` | user | `{ reason }`, once per user and event; admins see reports |

Event fields: `id, title, description, date, ends_at, venue, venue_address, capacity, category, image_url,
organizer_id, organizer_name, registration_opens_at, registration_closes_at, status, visibility,
paid_sales (none|active|stopped), suspended`.

## Tickets, orders and payments

| Method and path | Role | Notes |
|---|---|---|
| `POST /events/{id}/register` | user | free tickets: `{ ticket_type_id, quantity }` (1-10) |
| `POST /orders/checkout` | user | `{ event_id, items: [{ ticket_type_id, quantity }], promo_code, simulate: success\|failure }` -> `{ order_id, status: paid\|free\|failed, subtotal, discount, total, tickets }`. Prices, discounts and stock are decided by the server in one transaction. Paid items need `paid_sales: active`. A failed test payment keeps the order as `failed` and issues nothing |
| `POST /promo/validate` | user | `{ event_id, code }` -> `{ code, discount_type, amount }` |
| `GET /my-tickets` | user | tickets with `event { id, title, date, venue, image_url, status }` |
| `GET /my-orders` | user | `[{ id, created_at, status: paid\|free\|failed\|cancelled\|refunded, subtotal, discount, total, promo_code, event, items: [{ ticket_type, quantity, price }], tickets: [{ id, status }] }]` |
| `POST /checkin` | organizer or assigned staff | `{ event_id, qr_code }` -> `{ result: valid\|already_used\|invalid, ticket }` |

Rules: no tickets once the event has started, before `registration_opens_at`, after `registration_closes_at`,
or for draft, cancelled or suspended events.

## Organizer

| Method and path | Notes |
|---|---|
| `GET /organizer/events` | own events (drafts and cancelled too) with `sold, total_quantity, ticket_type_count, min_price` |
| `POST /organizer/events/{id}/cancel` | `{ reason }`: refunds every paid order (simulated), cancels free registrations, emails attendees |
| `GET /organizer/events/{id}/attendees` | `[{ ticket_id, order_id, full_name, email, ticket_type, status, checked_in_at }]` |
| `GET /organizer/events/{id}/orders` | like `/my-orders` plus `attendee { full_name, email }` |
| `GET\|PUT /organizer/events/{id}/refund-policy` | `{ policy }` |
| `POST /organizer/orders/{orderId}/cancel` | `{ reason }`, free registrations |
| `POST /organizer/orders/{orderId}/refund` | `{ reason }`, paid orders, full refund (simulated). Not possible once a ticket of the order was scanned |
| `GET /organizer/events/{id}/activation` | `{ identity_verified, payout_connected, fee_paid, terms_accepted, activated, paid_sales, fee_kzt, has_paid_ticket_type, requested_at }` |
| `POST /organizer/events/{id}/activation/{step}` | `identity`, `fee`, `terms` (simulated); `payout` checks the profile has holder, bank and IBAN; `activate` needs a paid ticket type and every step |
| `GET /organizer/events/{id}/analytics` | `{ event, capacity, sold, checked_in, revenue: { gross, discounts, refunds, net }, sales_by_day, by_ticket_type, promo }` |
| `GET /organizer/events/{id}/history` | `{ event, activity: [{ id, at, actor, type: event\|tickets\|orders\|checkin\|payments, message }] }`, newest first |
| `GET\|PUT /organizer/profile` | `{ display_name, bio, contact_email, phone, website, city, payout: { holder_name, bank_name, iban (KZ + 18), bin_iin (12 digits) } }`. `display_name` is shown as the organizer name on event pages |
| `GET /organizer/campaigns` | own promo campaigns |
| `POST /organizer/campaigns` | `{ event_id (or null = all own events), name, discount_type: percent\|fixed, amount, starts_at, ends_at, max_redemptions }`; the server makes the code |
| `PATCH /organizer/campaigns/{id}` | `{ disabled }` |
| `GET\|POST /events/{id}/staff`, `DELETE /events/{id}/staff/{userId}` | check-in staff by email |
| `GET /staff/events` | events the caller may check in for (mobile app) |

The campaign QR is drawn by the website and opens `/events/{id}?promo=CODE`.

## Support chat

| Method and path | Role | Notes |
|---|---|---|
| `GET /support/cases` | user | own cases |
| `POST /support/cases` | user | `{ category: tickets\|payment\|event\|account\|organizer\|other, subject, message, context: { type: event\|order\|ticket, id } \| null }` -> `{ id }` |
| `GET /support/cases/{id}` | user, author only | case + `messages` |
| `POST /support/cases/{id}/messages` | user, author only | `{ body }`; reopens a waiting or resolved case |
| `GET /admin/support/cases?status=` | platform_admin | all cases with `requester` and `assignee` |
| `GET /admin/support/cases/{id}` | platform_admin | |
| `PATCH /admin/support/cases/{id}` | platform_admin | `{ status: open\|in_progress\|waiting\|resolved }` or `{ assign_to_me: true }` |
| `POST /admin/support/cases/{id}/messages` | platform_admin | `{ body }`; the case then waits for the customer |

## Platform admin

| Method and path | Notes |
|---|---|
| `GET /admin/users` | all users with `suspended` |
| `GET /admin/events` | all events with `tickets_sold, revenue_kzt, reports, activation` |
| `GET /admin/stats` | `{ failed_payments_7d, users, events, open_support_cases }` |
| `GET /admin/audit` | latest 200 audit log entries |
| `POST /admin/users/{id}/suspend\|unsuspend` | `{ reason }`; a suspended user is locked out at once |
| `POST /admin/events/{id}/suspend\|restore` | `{ reason }`; suspend hides the event and stops paid sales; after restore, paid sales stay stopped until resumed |
| `POST /admin/events/{id}/stop-sales\|resume-sales` | `{ reason }` |

To make an admin account (no sign-up form for it, on purpose):

```
docker compose exec db psql -U biletflow -d biletflow -c "UPDATE users SET role='platform_admin' WHERE email='you@example.com';"
```

Then log out and log in again.

## Tests

`go test ./...` in `backend`. The database tests (including `TestFullFlowsDB`, which walks through
every endpoint above) run when `TEST_DATABASE_URL` is set; CI starts a Postgres for them.
