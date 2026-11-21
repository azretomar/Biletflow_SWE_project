# Backend endpoints the new web pages are waiting for

The pages below are already on the site. Each one calls its endpoint; while an endpoint
does not exist (404), the page shows an empty state and "This part is not connected to the
server yet", and starts working by itself once the endpoint is added.
These are proposals: change names or fields together with the frontend.
All amounts are whole KZT. All times are ISO 8601 with time zone.

## Already working (no backend change needed)

| Page | Endpoint |
|---|---|
| Printable ticket `/tickets/:id/print` | `GET /api/my-tickets` |
| Checkout, free tickets `/events/:id/checkout` | `GET /api/events/{id}`, `POST /api/events/{id}/register` |
| Create event, Publish (public) `/create-event` | `POST /api/events` |
| Home, Events, Event page, My tickets, Ticket view | `GET /api/events`, `GET /api/events/{id}`, `GET /api/my-tickets` |
| Event management: details, ticket types, check-in staff | `GET /api/events/{id}`, `GET/POST/DELETE /api/events/{id}/staff` |
| Edit event (loading the current details) | `GET /api/events/{id}` |
| Organizer dashboard, event list in Promo campaigns | `GET /api/organizer/events` |

## Checkout and promo codes (SRS 4.6, 4.14)

- `POST /api/orders/checkout` (logged in)
  `{ event_id, items: [{ ticket_type_id, quantity }], promo_code, simulate: "success" | "failure" }`
  -> `{ order_id, status: "paid" | "failed", total, tickets: [{ id, qr_code, status }] }`
  The server calculates prices and discounts and reserves tickets atomically.
- `POST /api/promo/validate` `{ event_id, code }` -> `{ code, discount_type: "percent" | "fixed", amount }`

## Orders and refunds (SRS 4.9)

- `GET /api/my-orders` -> `[{ id, created_at, status: "paid" | "free" | "failed" | "cancelled" | "refunded", total, event: { id, title, date }, items: [{ ticket_type, quantity, price }], tickets: [{ id, status }] }]`
- `GET /api/organizer/events/{id}/orders` (event's organizer) -> same as above plus `attendee: { full_name, email }`
- `GET|PUT /api/organizer/events/{id}/refund-policy` `{ policy }`
- `POST /api/organizer/orders/{orderId}/cancel` `{ reason }` (free registrations)
- `POST /api/organizer/orders/{orderId}/refund` `{ reason }` (full refund, simulated)
  Cancelled/refunded tickets become invalid; every action goes to the audit log.

## Organizer profile (SRS 4.1)

- `GET|PUT /api/organizer/profile` `{ display_name, bio, contact_email, phone, website, city, payout: { holder_name, bank_name, iban, bin_iin } }`
  Payout details are visible only to the organizer and platform admins. Payouts are simulated.

## Account (SRS 4.1, 4.10)

- `POST /api/auth/verify-email` `{ token }`
- `POST /api/auth/resend-verification` (logged in)
- `POST /api/auth/forgot-password` `{ email }` -> always 200 (do not reveal whether the email exists)
- `POST /api/auth/reset-password` `{ token, password }` (8-72 characters)
  The emails link to `/verify-email?token=...` and `/reset-password?token=...` on the website.

## Create event, extended (SRS 4.2)

`POST /api/events` currently rejects unknown fields. To support drafts and visibility, also accept:
`status: "draft" | "published"`, `visibility: "public" | "unlisted" | "private"`, `ends_at`,
`registration_opens_at`, `venue_address`.

## Support chat (SRS 4.13)

Users (author of the case only):
- `GET /api/support/cases` -> `[{ id, subject, status, category, updated_at, context }]`
- `POST /api/support/cases` `{ category, subject, message, context: { type: "event" | "order" | "ticket", id } | null }` -> `{ id }`
- `GET /api/support/cases/{id}` -> `{ id, subject, status, category, context, created_at, messages: [{ id, author_name, author_role, body, created_at }] }`
- `POST /api/support/cases/{id}/messages` `{ body }`

Platform admins:
- `GET /api/admin/support/cases?status=` -> cases plus `requester: { full_name, email }`, `assignee: { id, full_name } | null`
- `GET /api/admin/support/cases/{id}`
- `PATCH /api/admin/support/cases/{id}` `{ status }` or `{ assign_to_me: true }`
- `POST /api/admin/support/cases/{id}/messages` `{ body }`

Statuses: `open`, `in_progress`, `waiting` (for customer), `resolved`.

## Organizer events (SRS 4.2, 4.16)

- ~~`GET /api/organizer/events`~~ done (`backend/organizer.go`): own events with `sold`, `total_quantity`, `ticket_type_count`, `min_price`. Still to add: `status: "cancelled"` once events can be cancelled.
- `PUT /api/events/{id}` same fields as `POST /api/events` (Edit event)
- `POST /api/organizer/events/{id}/cancel` `{ reason }`
- `GET /api/organizer/events/{id}/attendees` -> `[{ ticket_id, full_name, email, ticket_type, status }]`
- Small addition: include `image_url` in the `event` object of `GET /api/my-tickets`, so My tickets can show the cover.

## Paid sales activation (SRS 3.2, 4.5)

- `GET /api/organizer/events/{id}/activation` -> `{ identity_verified, payout_connected, fee_paid, terms_accepted, activated, fee_kzt }`
- `POST /api/organizer/events/{id}/activation/{step}` (step = `identity` | `payout` | `fee` | `terms`), all simulated
- `POST /api/organizer/events/{id}/activation/activate`

## Promo campaigns (SRS 4.14)

- `GET /api/organizer/campaigns` -> `[{ id, event_id, name, code, discount_type, amount, starts_at, ends_at, max_redemptions, redemptions, disabled, qr_url }]`
- `POST /api/organizer/campaigns` `{ event_id, name, discount_type, amount, starts_at, ends_at, max_redemptions }` (server generates `code` and the campaign QR)
- `PATCH /api/organizer/campaigns/{id}` `{ disabled }`

## Analytics and history (SRS 4.15, 4.16)

- `GET /api/organizer/events/{id}/analytics` -> format at the top of `frontend/src/pages/organizer/EventAnalytics.jsx`
- `GET /api/organizer/events/{id}/history` -> format at the top of `frontend/src/pages/organizer/EventHistory.jsx`

## Platform admin (SRS 4.12) - platform_admin only, every action logged with its reason

- `GET /api/admin/users` -> `[{ id, full_name, email, role, suspended, created_at }]`
- `GET /api/admin/events` -> `[{ id, title, organizer_id, category, venue, start_at, status, suspended, capacity, tickets_sold, revenue_kzt, reports: [{ id, reason, reporter, created_at }], activation: null | { paid_sales: "pending" | "active" | "stopped", identity_verified, fee_paid, payout_account, terms_accepted, requested_at } }]`
- `GET /api/admin/stats` -> `{ failed_payments_7d }`
- `POST /api/admin/users/{id}/suspend` and `/unsuspend` `{ reason }` (a suspended user cannot log in)
- `POST /api/admin/events/{id}/suspend` and `/restore` `{ reason }` (suspend hides the event and stops sales)
- `POST /api/admin/events/{id}/stop-sales` and `/resume-sales` `{ reason }`
