# BiletFlow

Self-service event ticketing platform for Kazakhstan (CSCI 361, Team 5). This is an academic prototype: payments, identity checks, payouts and emails are simulated, and no real money moves.

## Tech stack

| Area                | Choice                                  |
| ------------------- | --------------------------------------- |
| Backend             | Go                                      |
| Database            | PostgreSQL                              |
| Web frontend        | React (Vite)                            |
| Mobile app          | React Native (Expo SDK 58, TypeScript)  |
| Deployment          | Docker Compose                          |
| Design              | Canva mockups                           |
| Task tracking       | Jira                                    |

## Features

### Web app

- Accounts: sign up, log in, email verification, password reset, roles (attendee, organizer, event admin, platform admin). Passwords are hashed with bcrypt.
- Events: create, edit, preview, publish, move back to draft (only while no tickets are issued), cancel, duplicate into a new draft, report an event. Public, unlisted and private visibility, registration open and close times, capacity.
- Organizer profile with contact and payout details, and a refund policy per event.
- Ticket types: free and paid, price, quantity, sales window, limit per order, hidden types. Sales stop automatically when a ticket type is sold out.
- Free registration and simulated checkout (success or failure). Ticket inventory is locked during checkout so tickets cannot be oversold. A failed payment creates no tickets.
- Paid sales activation per event with a checklist (identity check, payout account, activation fee, terms; all simulated).
- QR-code tickets, ticket page, and a printable ticket (Print / Save as PDF through the browser).
- Promo codes and campaign QR codes (`/events/:id?promo=CODE`). Discounts are calculated and limited on the server. A campaign QR is rejected at check-in.
- Orders, order cancellation and full refunds (simulated). Refunded and cancelled tickets become invalid.
- Organizer analytics: capacity, sales over time, revenue, ticket types, campaigns and attendance, with date range and ticket type filters.
- Organizer event history: Upcoming, Active, Completed and Cancelled events, and an activity timeline per event with filters.
- Support cases with a message thread, linked to an event, order or ticket. Statuses: Open, In Progress, Waiting for Customer, Resolved. Cases can be assigned.
- Admin portal: users, events, reported events, paid-sales activations, support cases, suspend and restore users and events, stop and resume paid sales, CSV export of users and events, audit log of admin actions (API: `/api/admin/audit`).
- Interface in Kazakh, Russian and English (language switch in the top bar; the choice is remembered in the browser).

### Mobile app (event admins)

- Sign in and see only the events you are assigned to.
- Scan ticket QR codes with the camera. Results: valid, already used, cancelled, refunded, invalid.
- Undo an accidental check-in, search attendees by hand, see registered and checked-in counts.
- Check-ins are saved on the server right away (online only).
- The app also has attendee and organizer screens. The platform admin portal is only on the website.

## API

The full list of endpoints is in [docs/api.md](docs/api.md). Errors always look like `{ "error": "message" }`. Send `Authorization: Bearer <token>` where a role is required.

## Frontend pages

Public: `/`, `/events`, `/events/:id`, `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`

Logged-in users: `/events/:id/checkout`, `/my-tickets`, `/tickets/:id`, `/tickets/:id/print`, `/my-orders`, `/support`, `/support/new`, `/support/:id`

Organizer: `/create-event`, `/organizer/dashboard`, `/organizer/profile`, `/organizer/promo`, `/organizer/events/:id` (management, `/edit`, `/ticket-types/new`, `/ticket-types/:typeId/edit`, `/activation`, `/orders`, `/analytics`, `/history`)

Platform admin: `/admin` (dashboard, `/events`, `/events/:id`, `/users`, `/activations`, `/support`, `/support/:id`)

## Simulations and scope

- Payments, identity verification, payouts and the activation fee are simulated (allowed by SRS 3.2 and 4.6). Demo payments are labelled as simulated and are never shown as real transactions.
- Emails (verification, password reset, order confirmations with ticket links, refunds, cancellations, support replies) are written to the backend log instead of being sent: `docker compose logs backend`. The links in them work.
- Error messages from the backend and the email texts are in English.
- Bonus features from the SRS are not included: assigned seating, calendar (.ics) export, GA4 analytics, offline check-in, support attachments.

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

### Demo data

With the backend running:

```
node scripts/seed-demo.mjs            # or: node scripts/seed-demo.mjs http://localhost:8080
```

It creates demo accounts (`demo.organizer@biletflow.test`, `demo.staff@biletflow.test`, `demo.attendee@biletflow.test` and others), events, tickets and orders. The password is `DEMO_PASSWORD` at the top of the script.

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

## Mobile app

```
docker compose up -d --build db backend
cd mobile
npm install
cp .env.example .env    # set EXPO_PUBLIC_API_URL to http://<laptop Wi-Fi IP>:8080
npx expo start          # open with Expo Go on the phone
```

The phone and the laptop must be on the same Wi-Fi. More details are in [mobile/README.md](mobile/README.md).

## Tests

```
cd backend
go test ./...
```

Backend tests use a real PostgreSQL database through `TEST_DATABASE_URL`. CI (`.github/workflows/ci.yml`) runs `go vet`, `go build` and `go test` on every push to `main` and on pull requests. For the mobile app, run `npm run typecheck` in `mobile`.