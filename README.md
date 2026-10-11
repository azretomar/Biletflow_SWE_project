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
| GET | /events | none | list of events |
| GET | /events/:id | none | one event |
| POST | /events | title, description, date, venue, capacity, category | the created event |

Event fields: id, title, description, date, venue, capacity, category.
Roles: attendee, organizer.

## Frontend pages (static, no backend yet)

- / (Home)
- /signup
- /login
- /create-event

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

Run only the database in Docker, and the backend and frontend on the host:

```bash
docker compose up -d db
cd backend && go run .          # reads backend/.env (export the vars or use a tool like direnv)
cd frontend && npm install && npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8080`.

## 
