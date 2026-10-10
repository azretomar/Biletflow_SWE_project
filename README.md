# BiletFlow

Self-service event ticketing platform for Kazakhstan (CSCI 361, Team 5).

## Tech stack

| Area | Choice |
| --- | --- |
| Backend | Go |
| Database | MySQL |
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

## Run the frontend locally

```bash
cd frontend
npm install
npm run dev
```