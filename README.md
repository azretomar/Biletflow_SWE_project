# BiletFlow

Self-service event ticketing platform for Kazakhstan (CSCI 361, Team 5).

## Tech stack

| Area | Choice |
| --- | --- |
| Backend | Go |
| Database | PostgreSQL |
| Web frontend | React (Vite) |
| Mobile check-in app | Flutter |
| Design | Canva mockups |
| Task tracking | Jira |

## Planned API endpoints (draft, to be confirmed with backend)

| Method | Path | Sends | Returns |
| --- | --- | --- | --- |
| POST | /signup | fullName, email, password, role | the created user |
| POST | /login | email, password | the user (and a login token) |
| GET | /events | none | list of events, each with min_price |
| GET | /events/:id | none | one event, with its ticket_types |
| POST | /events | title, description, date, venue, capacity, category | the created event |
| POST | /events/:id/ticket-types | name, description, price, quantity | the created ticket type |

Event fields: id, title, description, date, venue, capacity, category, image_url, organizer_name, registration_closes_at.
Event list extra field: min_price (lowest ticket price in KZT, 0 means free).
Ticket type fields: id, name, description, price (KZT, 0 for free), quantity, quantity_left.
Organizer event fields (dashboard and Event management): status (upcoming, active, completed, cancelled), sold, checked_in, paid_activated.
Attendee row fields: name, email, ticket_type, ticket_id, status (valid, checked_in, cancelled, refunded).
Order row fields: id, buyer, total, status (paid, free, refunded, cancelled).


### Frontend pages

Built:
- / (Home)
- /events (Event list, empty until the backend is connected)
- /signup
- /login
- /create-event
- /organizer/dashboard (Organizer dashboard)
- /organizer/events/:id (Event management)
- /organizer/events/:id/edit (Edit event)
- /organizer/events/:id/ticket-types/new (Ticket type form)
- /organizer/events/:id/activation (Activation checklist)
- /organizer/events/:id/analytics (Event analytics)
- /organizer/events/:id/history (Event history, with duplicate event)
- /organizer/promo (Promo campaigns)
- /admin and its sub-pages (admin portal)

Planned:
- /events/:id (Event detail)
- /events/:id/register (Registration)
- /my-tickets and the single ticket view (/tickets/:id)

Shared code: `src/components/Navbar.jsx` (navbar, with a temporary logged-in/logged-out dev switch) and `src/shared.css` (styles for the new pages). Older pages (Home, Sign up, Log in, Create event, Admin, Promo) keep their own CSS files and may be migrated to `shared.css` later.    


## Run everything with Docker

Requires Docker Desktop (or Docker Engine + Compose v2).

```bash
cp backend/.env.example backend/.env   # then set JWT_SECRET (32+ chars)
docker compose up --build
```

| Service | URL |
| --- | --- |
| Web app | http://localhost:5173 |
| API | http://localhost:8080 (health: `/health`) |
| PostgreSQL | localhost:5432, user/password/db `biletflow` |

nginx in the frontend container forwards `/api/*` to the backend, so the browser
talks to one origin and no CORS setup is needed.

Stop with `docker compose down`. **Do not** add `-v` unless you want to wipe the database.

## Local development (hot reload)

Run only the database in Docker, and the backend and frontend on the host, each in its own terminal:

```bash
docker compose up -d db
```

```bash
cd backend
go run .   # needs DATABASE_URL and JWT_SECRET in the environment (see backend/.env.example)
```

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8080`.

### Frontend only

To work on pages without the backend, just run the last block (`npm install`, `npm run dev`).
API calls will fail until the backend is running.
