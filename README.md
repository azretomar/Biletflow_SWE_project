# BiletFlow

Self-service event ticketing platform for Kazakhstan (CSCI 361, Team 5). This is an academic prototype: payments, identity checks, payouts and emails are simulated, and no real money moves.

## Tech stack

| Area                | Choice        |
| ------------------- | ------------- |
| Backend             | Go            |
| Database            | PostgreSQL    |
| Web frontend        | React (Vite)  |
| Mobile app          | React Native (Expo, TypeScript), in progress |
| Design              | Canva mockups |
| Task tracking       | Jira          |

## Features (web part)

- Accounts: sign up, log in, email verification, password reset, roles (attendee, organizer, event admin, platform admin).
- Events: create, edit, publish, cancel, duplicate into a new draft, report an event. Organizer profile and refund policy.
- Ticket types: free and paid, price, quantity, sale period, per-order limit.
- Free registration and simulated checkout (success or failure), with ticket inventory locked during checkout.
- Paid sales activation per event (identity check, payout account, activation fee and terms, all simulated).
- QR-code tickets, ticket page, and a printable ticket (Print / Save as PDF through the browser).
- Promo codes and campaign QR codes (`/events/:id?promo=CODE`). Discounts are calculated and limited on the server. A campaign QR is rejected at check-in.
- Check-in endpoint for the organizer and staff assigned to the event, and check-in undo. Staff assignment per event.
- Orders, order cancellation and full refunds (simulated).
- Organizer analytics (capacity, sales over time, revenue, ticket types, campaigns, attendance) and event history with activity timeline.
- Support cases with a message thread (attendee, platform admin, and the organizer for cases about their own events).
- Ticket type sale rules: sales window, limit per order, hidden types.
- Admin portal: users, events, paid-sales activations, support cases, suspend and restore users and events, audit log of admin actions (API: `/api/admin/audit`).

## API

The full list of endpoints is in [docs/api.md](docs/api.md). Errors always look like `{ "error": "message" }`. Send `Authorization: Bearer <token>` where a role is required.

## Frontend pages

Public: `/`, `/events`, `/events/:id`, `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`

Logged-in users: `/events/:id/checkout`, `/my-tickets`, `/tickets/:id`, `/tickets/:id/print`, `/my-orders`, `/support`, `/support/new`, `/support/:id`

Organizer: `/create-event`, `/organizer/dashboard`, `/organizer/profile`, `/organizer/promo`, `/organizer/events/:id` (management, `/edit`, `/ticket-types/new`, `/ticket-types/:typeId/edit`, `/activation`, `/orders`, `/analytics`, `/history`)

Platform admin: `/admin` (dashboard, `/events`, `/events/:id`, `/users`, `/activations`, `/support`, `/support/:id`)

## Simulations and known limitations

- Payments, identity verification, payouts and the activation fee are simulated (allowed by SRS 3.2 and 4.6).
- Emails (verification, password reset, refunds, cancellations) are written to the backend log instead of being sent: `docker compose logs backend`. The links in them work. No mail service is connected, and ticket confirmation emails are not sent; tickets are available in the attendee's account.
- The website interface is available in Kazakh, Russian and English (language switch in the top bar; the choice is remembered in the browser). Translations live in `frontend/src/i18n/kk.js` and `ru.js`. Error messages that come from the backend and the emails are still in English.
- Not implemented: assigned seating, calendar (.ics) export, server-generated PDF tickets (the printable page uses the browser's print dialog), an admin page for the audit log, configurable activation fee.
- The mobile verification app is not part of this web release.

## Run everything with Docker

Requires Docker Desktop (or Docker Engine + Compose v2).

```
cp backend/.env.example backend/.env   # then set JWT_SECRET (32+ chars)
docker compose up --build
```

| Service    | URL                                            |
| ---------- | ---------------------------------------------- |
| Web app    | http://localhost:5173                          |
| API        | http://localhost:8080 (health: `/health`)      |
| PostgreSQL | localhost:5432, user/password/db `biletflow`   |

nginx in the frontend container forwards `/api/*` to the backend, so the browser talks to one origin and no CORS setup is needed.

Stop with `docker compose down`. Do not add `-v` unless you want to wipe the database.

## Local development (hot reload)

Run only the database in Docker, and the backend and frontend on the host, each in its own terminal:

```
docker compose up -d db
```

```
cd backend
go run .   # needs DATABASE_URL and JWT_SECRET in the environment (see backend/.env.example)
```

```
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8080`.

### Frontend only

To work on pages without the backend, run only `npm install` and `npm run dev` in `frontend`. API calls will fail until the backend is running.

## Tests

```
cd backend
go test ./...
```

Backend tests use a real PostgreSQL database through `TEST_DATABASE_URL`. CI (`.github/workflows/ci.yml`) runs `go vet`, `go build` and `go test` on every push to `main` and on pull requests.
