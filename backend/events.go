package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

CREATE TABLE IF NOT EXISTS event_reports (
	id          BIGSERIAL PRIMARY KEY,
	event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	reporter_id UUID NOT NULL REFERENCES users(id),
	reason      TEXT NOT NULL,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (event_id, reporter_id)
);
`

const schemaTicketSales = `
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS sales_starts_at TIMESTAMPTZ;
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS sales_ends_at   TIMESTAMPTZ;
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS max_per_order   INT CHECK (max_per_order BETWEEN 1 AND 10);
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS hidden          BOOLEAN NOT NULL DEFAULT FALSE;
`

func init() {
	schemas = append(schemas, schemaEvents)
	alterSchemas = append(alterSchemas, schemaTicketSales)
}

var eventCategories = map[string]bool{"music": true, "education": true, "sports": true, "other": true}

type Event struct {
	ID                 string     `json:"id"`
	Title              string     `json:"title"`
	Description        string     `json:"description"`
	Date               time.Time  `json:"date"`
	EndsAt             *time.Time `json:"ends_at"`
	Venue              string     `json:"venue"`
	VenueAddress       string     `json:"venue_address"`
	Capacity           int        `json:"capacity"`
	Category           string     `json:"category"`
	ImageURL           string     `json:"image_url"`
	OrganizerID        string     `json:"organizer_id"`
	OrganizerName      string     `json:"organizer_name"`
	RegistrationOpens  *time.Time `json:"registration_opens_at"`
	RegistrationCloses *time.Time `json:"registration_closes_at"`
	Status             string     `json:"status"`
	Visibility         string     `json:"visibility"`
	PaidSales          string     `json:"paid_sales"`
	Suspended          bool       `json:"suspended"`
}

const eventColumns = `
	e.id, e.title, e.description, e.date, e.ends_at, e.venue, e.venue_address, e.capacity,
	e.category, e.image_url, e.organizer_id,
	COALESCE(NULLIF((SELECT p.display_name FROM organizer_profiles p WHERE p.user_id = e.organizer_id), ''), u.full_name),
	e.registration_opens_at,
	e.registration_closes_at, e.status, e.visibility, e.paid_sales, e.suspended`

func scanEvent(row rowScanner, ev *Event, extra ...any) error {
	dest := []any{&ev.ID, &ev.Title, &ev.Description, &ev.Date, &ev.EndsAt, &ev.Venue, &ev.VenueAddress,
		&ev.Capacity, &ev.Category, &ev.ImageURL, &ev.OrganizerID, &ev.OrganizerName,
		&ev.RegistrationOpens, &ev.RegistrationCloses, &ev.Status, &ev.Visibility, &ev.PaidSales, &ev.Suspended}
	return row.Scan(append(dest, extra...)...)
}

type EventListItem struct {
	Event
	MinPrice int `json:"min_price"`
}

type TicketType struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Description   string     `json:"description"`
	Price         int        `json:"price"`
	Quantity      int        `json:"quantity"`
	QuantityLeft  int        `json:"quantity_left"`
	SalesStartsAt *time.Time `json:"sales_starts_at"`
	SalesEndsAt   *time.Time `json:"sales_ends_at"`
	MaxPerOrder   *int       `json:"max_per_order"`
	Hidden        bool       `json:"hidden"`
}

const ticketTypeColumns = `id, name, description, price, quantity, quantity_left,
	       sales_starts_at, sales_ends_at, max_per_order, hidden`

func scanTicketType(row rowScanner, t *TicketType) error {
	return row.Scan(&t.ID, &t.Name, &t.Description, &t.Price, &t.Quantity, &t.QuantityLeft,
		&t.SalesStartsAt, &t.SalesEndsAt, &t.MaxPerOrder, &t.Hidden)
}

type EventDetail struct {
	Event
	TicketTypes []TicketType `json:"ticket_types"`
}

func isBadUUID(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "22P02"
}

func (s *Server) registerEventRoutes(mux *http.ServeMux) {
	organizerOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("organizer")(h))
	}
	mux.HandleFunc("GET /api/events", s.handleListEvents)
	mux.HandleFunc("GET /api/events/{id}", s.handleGetEvent)
	mux.Handle("POST /api/events", organizerOnly(s.handleCreateEvent))
	mux.Handle("PUT /api/events/{id}", organizerOnly(s.handleUpdateEvent))
	mux.Handle("POST /api/events/{id}/ticket-types", organizerOnly(s.handleCreateTicketType))
	mux.Handle("PUT /api/events/{id}/ticket-types/{typeId}", organizerOnly(s.handleUpdateTicketType))
	mux.Handle("DELETE /api/events/{id}/ticket-types/{typeId}", organizerOnly(s.handleDeleteTicketType))
	mux.Handle("POST /api/events/{id}/report", s.requireAuth(http.HandlerFunc(s.handleReportEvent)))
}

func (s *Server) handleListEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT `+eventColumns+`,
		       COALESCE((SELECT MIN(price) FROM ticket_types t WHERE t.event_id = e.id AND NOT t.hidden), 0)
		FROM events e
		JOIN users u ON u.id = e.organizer_id
		WHERE e.status = 'published' AND e.visibility = 'public' AND NOT e.suspended
		ORDER BY e.date ASC`)
	if err != nil {
		internalError(w, "list events", err)
		return
	}
	defer rows.Close()

	list := []EventListItem{}
	for rows.Next() {
		var it EventListItem
		if err := scanEvent(rows, &it.Event, &it.MinPrice); err != nil {
			internalError(w, "list events: scan", err)
			return
		}
		list = append(list, it)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "list events: rows", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) canSeeEvent(ctx context.Context, ev Event, claims *Claims) bool {
	if claims != nil && (claims.Subject == ev.OrganizerID || claims.Role == "platform_admin") {
		return true
	}
	if ev.Suspended || ev.Status == "draft" {
		return false
	}
	if ev.Visibility != "private" {
		return true
	}
	if claims == nil {
		return false
	}
	var has bool
	_ = s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tickets WHERE event_id = $1 AND user_id = $2)`,
		ev.ID, claims.Subject).Scan(&has)
	return has
}

func (s *Server) handleGetEvent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var ev EventDetail
	err := scanEvent(s.db.QueryRow(r.Context(), `
		SELECT `+eventColumns+`
		FROM events e
		JOIN users u ON u.id = e.organizer_id
		WHERE e.id = $1`, id), &ev.Event)
	if errors.Is(err, pgx.ErrNoRows) || isBadUUID(err) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		internalError(w, "get event", err)
		return
	}
	claims := s.optionalClaims(r)
	if !s.canSeeEvent(r.Context(), ev.Event, claims) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}

	seeHidden := claims != nil && (claims.Subject == ev.OrganizerID || claims.Role == "platform_admin")
	types, err := s.loadTicketTypes(r.Context(), id, seeHidden)
	if err != nil {
		internalError(w, "get event: ticket types", err)
		return
	}
	ev.TicketTypes = types
	writeJSON(w, http.StatusOK, ev)
}

func (s *Server) loadTicketTypes(ctx context.Context, eventID string, includeHidden bool) ([]TicketType, error) {
	q := `SELECT ` + ticketTypeColumns + ` FROM ticket_types WHERE event_id = $1`
	if !includeHidden {
		q += ` AND NOT hidden`
	}
	rows, err := s.db.Query(ctx, q+` ORDER BY price ASC, created_at ASC`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	types := []TicketType{}
	for rows.Next() {
		var t TicketType
		if err := scanTicketType(rows, &t); err != nil {
			return nil, err
		}
		types = append(types, t)
	}
	return types, rows.Err()
}

type eventRequest struct {
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	Date               flexTime `json:"date"`
	Venue              string   `json:"venue"`
	Capacity           int      `json:"capacity"`
	Category           string   `json:"category"`
	ImageURL           string   `json:"image_url"`
	RegistrationCloses flexTime `json:"registration_closes_at"`
	Status             string   `json:"status"`
	Visibility         string   `json:"visibility"`
	EndsAt             flexTime `json:"ends_at"`
	RegistrationOpens  flexTime `json:"registration_opens_at"`
	VenueAddress       string   `json:"venue_address"`
}

func (req *eventRequest) validate() string {
	req.Title = strings.TrimSpace(req.Title)
	req.Venue = strings.TrimSpace(req.Venue)
	req.Description = strings.TrimSpace(req.Description)
	req.VenueAddress = strings.TrimSpace(req.VenueAddress)
	req.ImageURL = strings.TrimSpace(req.ImageURL)
	req.Category = strings.ToLower(strings.TrimSpace(req.Category))
	if req.Category == "" {
		req.Category = "other"
	}
	if req.Status == "" {
		req.Status = "published"
	}
	if req.Visibility == "" {
		req.Visibility = "public"
	}
	switch {
	case req.Title == "" || len(req.Title) > 200:
		return "title is required (max 200 characters)"
	case len(req.Description) > 5000:
		return "description is too long (max 5000 characters)"
	case req.Venue == "" || len(req.Venue) > 200:
		return "venue is required (max 200 characters)"
	case len(req.VenueAddress) > 300:
		return "venue_address is too long (max 300 characters)"
	case !req.Date.Set:
		return "date is required (ISO format, e.g. 2026-11-20T18:00:00+05:00)"
	case req.Capacity <= 0:
		return "capacity must be greater than 0"
	case req.Capacity > 1000000:
		return "capacity is too large"
	case !eventCategories[req.Category]:
		return "category must be music, education, sports or other"
	case req.ImageURL != "" && !strings.HasPrefix(req.ImageURL, "https://") && !strings.HasPrefix(req.ImageURL, "http://"):
		return "image_url must be an http(s) link"
	case len(req.ImageURL) > 2000:
		return "image_url is too long"
	case req.Status != "draft" && req.Status != "published":
		return "status must be draft or published"
	case req.Visibility != "public" && req.Visibility != "unlisted" && req.Visibility != "private":
		return "visibility must be public, unlisted or private"
	case req.EndsAt.Set && !req.EndsAt.After(req.Date.Time):
		return "ends_at must be after the start time"
	case req.RegistrationCloses.Set && req.RegistrationCloses.After(req.Date.Time):
		return "registration_closes_at must be before the event date"
	case req.RegistrationOpens.Set && req.RegistrationCloses.Set && !req.RegistrationOpens.Before(req.RegistrationCloses.Time):
		return "registration_opens_at must be before registration_closes_at"
	}
	return ""
}

func (s *Server) handleCreateEvent(w http.ResponseWriter, r *http.Request) {
	var req eventRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if msg := req.validate(); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if req.Date.Before(time.Now().Add(-time.Hour)) {
		writeError(w, http.StatusBadRequest, "the event date is in the past")
		return
	}

	ctx := r.Context()
	claims := claimsFrom(ctx)
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "create event: begin", err)
		return
	}
	defer tx.Rollback(context.Background())

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO events (organizer_id, title, description, date, venue, capacity, category, image_url,
		                    registration_closes_at, status, visibility, ends_at, registration_opens_at, venue_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING id`,
		claims.Subject, req.Title, req.Description, req.Date.Time, req.Venue, req.Capacity, req.Category,
		req.ImageURL, req.RegistrationCloses.ptr(), req.Status, req.Visibility, req.EndsAt.ptr(),
		req.RegistrationOpens.ptr(), req.VenueAddress,
	).Scan(&id)
	if err != nil {
		internalError(w, "create event: insert", err)
		return
	}
	verb := "Event created and published"
	if req.Status == "draft" {
		verb = "Event created as a draft"
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: claims.Subject, EventID: id, Category: "event",
		Action: "event.create", TargetID: id, Message: verb}); err != nil {
		internalError(w, "create event: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "create event: commit", err)
		return
	}

	ev, err := s.loadEvent(ctx, id)
	if err != nil {
		internalError(w, "create event: load", err)
		return
	}
	writeJSON(w, http.StatusCreated, ev)
}

func (s *Server) loadEvent(ctx context.Context, id string) (Event, error) {
	var ev Event
	err := scanEvent(s.db.QueryRow(ctx, `
		SELECT `+eventColumns+`
		FROM events e
		JOIN users u ON u.id = e.organizer_id
		WHERE e.id = $1`, id), &ev)
	return ev, err
}

type updateEventRequest struct {
	Title              string    `json:"title"`
	Description        string    `json:"description"`
	Date               flexTime  `json:"date"`
	Venue              string    `json:"venue"`
	Capacity           int       `json:"capacity"`
	Category           string    `json:"category"`
	ImageURL           string    `json:"image_url"`
	RegistrationCloses *flexTime `json:"registration_closes_at"`
	Status             *string   `json:"status"`
	Visibility         *string   `json:"visibility"`
	EndsAt             *flexTime `json:"ends_at"`
	RegistrationOpens  *flexTime `json:"registration_opens_at"`
	VenueAddress       *string   `json:"venue_address"`
}

func (s *Server) handleUpdateEvent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var upd updateEventRequest
	if !decodeJSON(w, r, &upd) {
		return
	}
	ctx := r.Context()
	claims := claimsFrom(ctx)

	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "update event: begin", err)
		return
	}
	defer tx.Rollback(context.Background())

	info, err := loadEventInfo(ctx, tx, id, true)
	if err != nil {
		notFoundOr500(w, "update event: load", "event", err)
		return
	}
	if info.OrganizerID != claims.Subject {
		writeError(w, http.StatusForbidden, "you do not own this event")
		return
	}
	if info.Status == "cancelled" {
		writeError(w, http.StatusConflict, "a cancelled event cannot be edited")
		return
	}
	old, err := s.loadEvent(ctx, id)
	if err != nil {
		internalError(w, "update event: load full", err)
		return
	}

	req := eventRequest{
		Title: upd.Title, Description: upd.Description, Date: upd.Date, Venue: upd.Venue,
		Capacity: upd.Capacity, Category: upd.Category, ImageURL: upd.ImageURL,
		Status: old.Status, Visibility: old.Visibility, VenueAddress: old.VenueAddress,
	}
	keep := func(t *time.Time) flexTime {
		if t == nil {
			return flexTime{}
		}
		return flexTime{Time: *t, Set: true}
	}
	req.RegistrationCloses = keep(old.RegistrationCloses)
	req.RegistrationOpens = keep(old.RegistrationOpens)
	req.EndsAt = keep(old.EndsAt)
	if upd.RegistrationCloses != nil {
		req.RegistrationCloses = *upd.RegistrationCloses
	}
	if upd.RegistrationOpens != nil {
		req.RegistrationOpens = *upd.RegistrationOpens
	}
	if upd.EndsAt != nil {
		req.EndsAt = *upd.EndsAt
	}
	if upd.Status != nil {
		req.Status = *upd.Status
	}
	if upd.Visibility != nil {
		req.Visibility = *upd.Visibility
	}
	if upd.VenueAddress != nil {
		req.VenueAddress = *upd.VenueAddress
	}
	if msg := req.validate(); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	var offered, issued int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(quantity - quantity_left), 0)
		FROM ticket_types WHERE event_id = $1`, id).Scan(&offered, &issued); err != nil {
		internalError(w, "update event: totals", err)
		return
	}
	if req.Capacity < offered {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("capacity cannot be lower than the %d tickets already offered in ticket types", offered))
		return
	}
	if req.Status == "draft" && old.Status == "published" && issued > 0 {
		writeError(w, http.StatusConflict, "tickets were already issued, so the event cannot go back to draft")
		return
	}

	_, err = tx.Exec(ctx, `
		UPDATE events SET title = $2, description = $3, date = $4, venue = $5, capacity = $6, category = $7,
		       image_url = $8, registration_closes_at = $9, status = $10, visibility = $11, ends_at = $12,
		       registration_opens_at = $13, venue_address = $14
		WHERE id = $1`,
		id, req.Title, req.Description, req.Date.Time, req.Venue, req.Capacity, req.Category, req.ImageURL,
		req.RegistrationCloses.ptr(), req.Status, req.Visibility, req.EndsAt.ptr(), req.RegistrationOpens.ptr(),
		req.VenueAddress)
	if err != nil {
		internalError(w, "update event: update", err)
		return
	}

	changed := changedEventFields(old, req)
	if len(changed) > 0 {
		msg := "Event details changed: " + strings.Join(changed, ", ")
		if old.Status == "draft" && req.Status == "published" {
			msg = "Event published"
		}
		if err := writeAudit(ctx, tx, auditEntry{ActorID: claims.Subject, EventID: id, Category: "event",
			Action: "event.update", TargetID: id, Message: msg}); err != nil {
			internalError(w, "update event: audit", err)
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "update event: commit", err)
		return
	}
	ev, err := s.loadEvent(ctx, id)
	if err != nil {
		internalError(w, "update event: reload", err)
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

func changedEventFields(old Event, req eventRequest) []string {
	var out []string
	add := func(cond bool, name string) {
		if cond {
			out = append(out, name)
		}
	}
	sameTime := func(a *time.Time, b flexTime) bool {
		if a == nil || !b.Set {
			return a == nil && !b.Set
		}
		return a.Equal(b.Time)
	}
	add(old.Title != req.Title, "title")
	add(old.Description != req.Description, "description")
	add(!old.Date.Equal(req.Date.Time), "date and time")
	add(old.Venue != req.Venue || old.VenueAddress != req.VenueAddress, "venue")
	add(old.Capacity != req.Capacity, "capacity")
	add(old.Category != req.Category, "category")
	add(old.ImageURL != req.ImageURL, "cover image")
	add(!sameTime(old.RegistrationOpens, req.RegistrationOpens) || !sameTime(old.RegistrationCloses, req.RegistrationCloses), "registration window")
	add(!sameTime(old.EndsAt, req.EndsAt), "end time")
	add(old.Visibility != req.Visibility, "visibility")
	add(old.Status != req.Status, "status")
	return out
}

type optTime struct {
	Given bool
	flexTime
}

func (o *optTime) UnmarshalJSON(b []byte) error {
	o.Given = true
	return o.flexTime.UnmarshalJSON(b)
}

type optInt struct {
	Given bool
	Value *int
}

func (o *optInt) UnmarshalJSON(b []byte) error {
	o.Given = true
	if string(b) == "null" {
		o.Value = nil
		return nil
	}
	var n int
	if err := json.Unmarshal(b, &n); err != nil {
		return err
	}
	o.Value = &n
	return nil
}

type ticketTypeRequest struct {
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	Price         int     `json:"price"`
	Quantity      int     `json:"quantity"`
	SalesStartsAt optTime `json:"sales_starts_at"`
	SalesEndsAt   optTime `json:"sales_ends_at"`
	MaxPerOrder   optInt  `json:"max_per_order"`
	Hidden        *bool   `json:"hidden"`
}

func validateSales(starts, ends *time.Time, maxPerOrder *int) string {
	if starts != nil && ends != nil && !starts.Before(*ends) {
		return "sales_starts_at must be before sales_ends_at"
	}
	if maxPerOrder != nil && (*maxPerOrder < 1 || *maxPerOrder > maxTicketsPerOrder) {
		return fmt.Sprintf("max_per_order must be between 1 and %d", maxTicketsPerOrder)
	}
	return ""
}

func (req *ticketTypeRequest) validate() string {
	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)
	switch {
	case req.Name == "" || len(req.Name) > 100:
		return "name is required (max 100 characters)"
	case len(req.Description) > 1000:
		return "description is too long (max 1000 characters)"
	case req.Price < 0:
		return "price cannot be negative (0 = free)"
	case req.Price > 10000000:
		return "price is too large"
	case req.Quantity <= 0:
		return "quantity must be greater than 0"
	}
	return ""
}

func ownedEventTx(w http.ResponseWriter, r *http.Request, tx pgx.Tx, id string) (eventInfo, bool) {
	info, err := loadEventInfo(r.Context(), tx, id, true)
	if err != nil {
		notFoundOr500(w, "load event", "event", err)
		return info, false
	}
	if info.OrganizerID != claimsFrom(r.Context()).Subject {
		writeError(w, http.StatusForbidden, "you do not own this event")
		return info, false
	}
	if info.Status == "cancelled" {
		writeError(w, http.StatusConflict, "this event is cancelled")
		return info, false
	}
	return info, true
}

func (s *Server) handleCreateTicketType(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("id")
	var req ticketTypeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if msg := req.validate(); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	starts, ends, maxPerOrder := req.SalesStartsAt.ptr(), req.SalesEndsAt.ptr(), req.MaxPerOrder.Value
	if msg := validateSales(starts, ends, maxPerOrder); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	hidden := req.Hidden != nil && *req.Hidden
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "create ticket type: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	info, ok := ownedEventTx(w, r, tx, eventID)
	if !ok {
		return
	}

	var already int
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(SUM(quantity), 0) FROM ticket_types WHERE event_id = $1`, eventID,
	).Scan(&already); err != nil {
		internalError(w, "create ticket type: sum", err)
		return
	}
	if already+req.Quantity > info.Capacity {
		writeError(w, http.StatusBadRequest, "total ticket quantity would exceed event capacity")
		return
	}

	var t TicketType
	err = scanTicketType(tx.QueryRow(ctx, `
		INSERT INTO ticket_types (event_id, name, description, price, quantity, quantity_left,
		                          sales_starts_at, sales_ends_at, max_per_order, hidden)
		VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9)
		RETURNING `+ticketTypeColumns,
		eventID, req.Name, req.Description, req.Price, req.Quantity, starts, ends, maxPerOrder, hidden), &t)
	if err != nil {
		internalError(w, "create ticket type: insert", err)
		return
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: info.OrganizerID, EventID: eventID, Category: "tickets",
		Action: "ticket_type.create", TargetID: t.ID,
		Message: fmt.Sprintf("Ticket type %q added: %s, %d tickets", t.Name, priceText(t.Price), t.Quantity)}); err != nil {
		internalError(w, "create ticket type: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "create ticket type: commit", err)
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

func priceText(p int) string {
	if p == 0 {
		return "free"
	}
	return kztText(p)
}

func (s *Server) handleUpdateTicketType(w http.ResponseWriter, r *http.Request) {
	eventID, typeID := r.PathValue("id"), r.PathValue("typeId")
	var req ticketTypeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if msg := req.validate(); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "update ticket type: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	info, ok := ownedEventTx(w, r, tx, eventID)
	if !ok {
		return
	}
	var old TicketType
	err = scanTicketType(tx.QueryRow(ctx, `
		SELECT `+ticketTypeColumns+`
		FROM ticket_types WHERE id = $1 AND event_id = $2 FOR UPDATE`, typeID, eventID), &old)
	if err != nil {
		notFoundOr500(w, "update ticket type: load", "ticket type", err)
		return
	}
	starts, ends, maxPerOrder, hidden := old.SalesStartsAt, old.SalesEndsAt, old.MaxPerOrder, old.Hidden
	if req.SalesStartsAt.Given {
		starts = req.SalesStartsAt.ptr()
	}
	if req.SalesEndsAt.Given {
		ends = req.SalesEndsAt.ptr()
	}
	if req.MaxPerOrder.Given {
		maxPerOrder = req.MaxPerOrder.Value
	}
	if req.Hidden != nil {
		hidden = *req.Hidden
	}
	if msg := validateSales(starts, ends, maxPerOrder); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	issued := old.Quantity - old.QuantityLeft
	if req.Price != old.Price && issued > 0 {
		writeError(w, http.StatusConflict, "the price cannot change after tickets of this type were issued")
		return
	}
	if req.Quantity < issued {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("quantity cannot be lower than the %d tickets already issued", issued))
		return
	}
	var others int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(quantity), 0) FROM ticket_types WHERE event_id = $1 AND id <> $2`,
		eventID, typeID).Scan(&others); err != nil {
		internalError(w, "update ticket type: sum", err)
		return
	}
	if others+req.Quantity > info.Capacity {
		writeError(w, http.StatusBadRequest, "total ticket quantity would exceed event capacity")
		return
	}
	var t TicketType
	err = scanTicketType(tx.QueryRow(ctx, `
		UPDATE ticket_types SET name = $3, description = $4, price = $5, quantity = $6::int, quantity_left = $6::int - $7::int,
		       sales_starts_at = $8, sales_ends_at = $9, max_per_order = $10, hidden = $11
		WHERE id = $1 AND event_id = $2
		RETURNING `+ticketTypeColumns,
		typeID, eventID, req.Name, req.Description, req.Price, req.Quantity, issued,
		starts, ends, maxPerOrder, hidden), &t)
	if err != nil {
		internalError(w, "update ticket type: update", err)
		return
	}
	msg := fmt.Sprintf("Ticket type %q changed: %s, %d tickets", t.Name, priceText(t.Price), t.Quantity)
	if t.Hidden != old.Hidden {
		if t.Hidden {
			msg += "; now hidden from attendees"
		} else {
			msg += "; now visible to attendees"
		}
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: info.OrganizerID, EventID: eventID, Category: "tickets",
		Action: "ticket_type.update", TargetID: typeID, Message: msg}); err != nil {
		internalError(w, "update ticket type: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "update ticket type: commit", err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) handleDeleteTicketType(w http.ResponseWriter, r *http.Request) {
	eventID, typeID := r.PathValue("id"), r.PathValue("typeId")
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "delete ticket type: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	info, ok := ownedEventTx(w, r, tx, eventID)
	if !ok {
		return
	}
	var name string
	var issued int
	var hasTickets bool
	err = tx.QueryRow(ctx, `
		SELECT name, quantity - quantity_left,
		       EXISTS (SELECT 1 FROM tickets WHERE ticket_type_id = tt.id)
		FROM ticket_types tt WHERE id = $1 AND event_id = $2 FOR UPDATE`, typeID, eventID,
	).Scan(&name, &issued, &hasTickets)
	if err != nil {
		notFoundOr500(w, "delete ticket type: load", "ticket type", err)
		return
	}
	if issued > 0 || hasTickets {
		writeError(w, http.StatusConflict, "tickets of this type were already issued, so it cannot be deleted; lower its quantity instead")
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM ticket_types WHERE id = $1`, typeID); err != nil {
		internalError(w, "delete ticket type: delete", err)
		return
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: info.OrganizerID, EventID: eventID, Category: "tickets",
		Action: "ticket_type.delete", TargetID: typeID, Message: fmt.Sprintf("Ticket type %q deleted", name)}); err != nil {
		internalError(w, "delete ticket type: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "delete ticket type: commit", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleReportEvent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	reason, ok := readReason(w, r, true)
	if !ok {
		return
	}
	ctx := r.Context()
	claims := claimsFrom(ctx)
	ev, err := s.loadEvent(ctx, id)
	if err != nil {
		notFoundOr500(w, "report event: load", "event", err)
		return
	}
	if !s.canSeeEvent(ctx, ev, claims) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if ev.OrganizerID == claims.Subject {
		writeError(w, http.StatusBadRequest, "you cannot report your own event")
		return
	}
	tag, err := s.db.Exec(ctx, `
		INSERT INTO event_reports (event_id, reporter_id, reason) VALUES ($1, $2, $3)
		ON CONFLICT (event_id, reporter_id) DO NOTHING`, id, claims.Subject, reason)
	if err != nil {
		internalError(w, "report event: insert", err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusConflict, "you already reported this event; our team will review it")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}
