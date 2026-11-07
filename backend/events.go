package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const schemaEvents = `
CREATE TABLE IF NOT EXISTS events (
	id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	organizer_id           UUID NOT NULL REFERENCES users(id),
	title                  TEXT NOT NULL,
	description            TEXT NOT NULL DEFAULT '',
	date                   TIMESTAMPTZ NOT NULL,
	venue                  TEXT NOT NULL,
	capacity               INT NOT NULL CHECK (capacity > 0),
	category               TEXT NOT NULL DEFAULT 'other',
	image_url              TEXT NOT NULL DEFAULT '',
	registration_closes_at TIMESTAMPTZ,
	created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_types (
	id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	name          TEXT NOT NULL,
	description   TEXT NOT NULL DEFAULT '',
	price         INT NOT NULL CHECK (price >= 0),
	quantity      INT NOT NULL CHECK (quantity > 0),
	quantity_left INT NOT NULL CHECK (quantity_left >= 0),
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

// Registers this file's tables so migrate() creates them.
func init() {
	schemas = append(schemas, schemaEvents)
}

type Event struct {
	ID                  string     `json:"id"`
	Title               string     `json:"title"`
	Description         string     `json:"description"`
	Date                time.Time  `json:"date"`
	Venue               string     `json:"venue"`
	Capacity            int        `json:"capacity"`
	Category            string     `json:"category"`
	ImageURL            string     `json:"image_url"`
	OrganizerName       string     `json:"organizer_name"`
	RegistrationCloses  *time.Time `json:"registration_closes_at"`
}

type EventListItem struct {
	Event
	MinPrice int `json:"min_price"`
}

type TicketType struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Price        int    `json:"price"`
	Quantity     int    `json:"quantity"`
	QuantityLeft int    `json:"quantity_left"`
}

type EventDetail struct {
	Event
	TicketTypes []TicketType `json:"ticket_types"`
}

// bad uuid in URL -> Postgres error 22P02. Treat as "not found".
func isBadUUID(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "22P02"
}

// GET /api/events
func (s *Server) handleListEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT e.id, e.title, e.description, e.date, e.venue, e.capacity, e.category,
		       e.image_url, u.full_name, e.registration_closes_at,
		       COALESCE((SELECT MIN(price) FROM ticket_types t WHERE t.event_id = e.id), 0)
		FROM events e
		JOIN users u ON u.id = e.organizer_id
		ORDER BY e.date ASC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	list := []EventListItem{}
	for rows.Next() {
		var it EventListItem
		if err := rows.Scan(&it.ID, &it.Title, &it.Description, &it.Date, &it.Venue,
			&it.Capacity, &it.Category, &it.ImageURL, &it.OrganizerName,
			&it.RegistrationCloses, &it.MinPrice); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		list = append(list, it)
	}
	if rows.Err() != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/events/{id}
func (s *Server) handleGetEvent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var ev EventDetail
	err := s.db.QueryRow(r.Context(), `
		SELECT e.id, e.title, e.description, e.date, e.venue, e.capacity, e.category,
		       e.image_url, u.full_name, e.registration_closes_at
		FROM events e
		JOIN users u ON u.id = e.organizer_id
		WHERE e.id = $1`, id,
	).Scan(&ev.ID, &ev.Title, &ev.Description, &ev.Date, &ev.Venue, &ev.Capacity,
		&ev.Category, &ev.ImageURL, &ev.OrganizerName, &ev.RegistrationCloses)
	if errors.Is(err, pgx.ErrNoRows) || isBadUUID(err) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	rows, err := s.db.Query(r.Context(), `
		SELECT id, name, description, price, quantity, quantity_left
		FROM ticket_types WHERE event_id = $1 ORDER BY price ASC, created_at ASC`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	ev.TicketTypes = []TicketType{}
	for rows.Next() {
		var t TicketType
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.Price, &t.Quantity, &t.QuantityLeft); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		ev.TicketTypes = append(ev.TicketTypes, t)
	}
	if rows.Err() != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

type createEventRequest struct {
	Title              string     `json:"title"`
	Description        string     `json:"description"`
	Date               time.Time  `json:"date"`
	Venue              string     `json:"venue"`
	Capacity           int        `json:"capacity"`
	Category           string     `json:"category"`
	ImageURL           string     `json:"image_url"`
	RegistrationCloses *time.Time `json:"registration_closes_at"`
}

// POST /api/events  (organizer only)
func (s *Server) handleCreateEvent(w http.ResponseWriter, r *http.Request) {
	var req createEventRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Venue = strings.TrimSpace(req.Venue)
	req.Category = strings.TrimSpace(req.Category)
	if req.Category == "" {
		req.Category = "other"
	}

	if req.Title == "" || len(req.Title) > 200 {
		writeError(w, http.StatusBadRequest, "title is required (max 200 characters)")
		return
	}
	if req.Venue == "" || len(req.Venue) > 200 {
		writeError(w, http.StatusBadRequest, "venue is required (max 200 characters)")
		return
	}
	if req.Date.IsZero() {
		writeError(w, http.StatusBadRequest, "date is required (ISO format, e.g. 2026-11-20T18:00:00+06:00)")
		return
	}
	if req.Capacity <= 0 {
		writeError(w, http.StatusBadRequest, "capacity must be greater than 0")
		return
	}
	if req.RegistrationCloses != nil && req.RegistrationCloses.After(req.Date) {
		writeError(w, http.StatusBadRequest, "registration_closes_at must be before the event date")
		return
	}

	claims := claimsFrom(r.Context())
	var id string
	err := s.db.QueryRow(r.Context(), `
		INSERT INTO events (organizer_id, title, description, date, venue, capacity,
		                    category, image_url, registration_closes_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id`,
		claims.Subject, req.Title, req.Description, req.Date, req.Venue, req.Capacity,
		req.Category, req.ImageURL, req.RegistrationCloses,
	).Scan(&id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	ev, err := s.loadEvent(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, ev)
}

func (s *Server) loadEvent(ctx context.Context, id string) (Event, error) {
	var ev Event
	err := s.db.QueryRow(ctx, `
		SELECT e.id, e.title, e.description, e.date, e.venue, e.capacity, e.category,
		       e.image_url, u.full_name, e.registration_closes_at
		FROM events e
		JOIN users u ON u.id = e.organizer_id
		WHERE e.id = $1`, id,
	).Scan(&ev.ID, &ev.Title, &ev.Description, &ev.Date, &ev.Venue, &ev.Capacity,
		&ev.Category, &ev.ImageURL, &ev.OrganizerName, &ev.RegistrationCloses)
	return ev, err
}

type createTicketTypeRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Price       int    `json:"price"`
	Quantity    int    `json:"quantity"`
}

// POST /api/events/{id}/ticket-types  (organizer who owns the event)
func (s *Server) handleCreateTicketType(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("id")
	claims := claimsFrom(r.Context())

	var req createTicketTypeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 100 {
		writeError(w, http.StatusBadRequest, "name is required (max 100 characters)")
		return
	}
	if req.Price < 0 {
		writeError(w, http.StatusBadRequest, "price cannot be negative (0 = free)")
		return
	}
	if req.Quantity <= 0 {
		writeError(w, http.StatusBadRequest, "quantity must be greater than 0")
		return
	}

	var organizerID string
	var capacity int
	err := s.db.QueryRow(r.Context(),
		`SELECT organizer_id, capacity FROM events WHERE id = $1`, eventID,
	).Scan(&organizerID, &capacity)
	if errors.Is(err, pgx.ErrNoRows) || isBadUUID(err) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if organizerID != claims.Subject {
		writeError(w, http.StatusForbidden, "you do not own this event")
		return
	}

	var already int
	if err := s.db.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(quantity), 0) FROM ticket_types WHERE event_id = $1`, eventID,
	).Scan(&already); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if already+req.Quantity > capacity {
		writeError(w, http.StatusBadRequest, "total ticket quantity would exceed event capacity")
		return
	}

	var t TicketType
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO ticket_types (event_id, name, description, price, quantity, quantity_left)
		VALUES ($1, $2, $3, $4, $5, $5)
		RETURNING id, name, description, price, quantity, quantity_left`,
		eventID, req.Name, req.Description, req.Price, req.Quantity,
	).Scan(&t.ID, &t.Name, &t.Description, &t.Price, &t.Quantity, &t.QuantityLeft)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, t)
}
