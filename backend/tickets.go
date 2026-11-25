package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const schemaTickets = `
CREATE TABLE IF NOT EXISTS orders (
	id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id      UUID NOT NULL REFERENCES users(id),
	event_id     UUID NOT NULL REFERENCES events(id),
	total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0), -- KZT, whole number, 0 = free
	status       TEXT NOT NULL DEFAULT 'completed'
	             CHECK (status IN ('pending','completed','cancelled','refunded')),
	created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_user  ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders (event_id);

CREATE TABLE IF NOT EXISTS tickets (
	id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
	event_id       UUID NOT NULL REFERENCES events(id),
	ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
	user_id        UUID NOT NULL REFERENCES users(id),
	qr_code        TEXT NOT NULL UNIQUE,
	status         TEXT NOT NULL DEFAULT 'valid'
	               CHECK (status IN ('valid','checked_in','cancelled','refunded')),
	price_paid     INTEGER NOT NULL DEFAULT 0 CHECK (price_paid >= 0), -- KZT at purchase time
	checked_in_at  TIMESTAMPTZ,
	checked_in_by  UUID REFERENCES users(id),
	created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_user  ON tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets (order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets (event_id);
`

// Registers this file's tables so migrate() creates them.
func init() {
	schemas = append(schemas, schemaTickets)
}

const (
	maxTicketsPerOrder = 10
	qrCodeBytes        = 32
	maxQRCodeLen       = 256
)

func (s *Server) registerTicketRoutes(mux *http.ServeMux) {
	mux.Handle("POST /api/events/{id}/register", s.requireAuth(http.HandlerFunc(s.handleRegister)))
	mux.Handle("GET /api/my-tickets", s.requireAuth(http.HandlerFunc(s.handleMyTickets)))
	mux.Handle("POST /api/checkin",
		s.requireAuth(s.requireRole("event_admin", "organizer")(http.HandlerFunc(s.handleCheckin))))
	mux.Handle("POST /api/checkin/undo",
		s.requireAuth(s.requireRole("event_admin", "organizer")(http.HandlerFunc(s.handleUndoCheckin))))
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func isUUID(s string) bool { return uuidRe.MatchString(s) }

func newQRCode() (string, error) {
	b := make([]byte, qrCodeBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

type registerRequest struct {
	TicketTypeID string `json:"ticket_type_id"`
	Quantity     int    `json:"quantity"`
}

type ticketBrief struct {
	ID     string `json:"id"`
	QRCode string `json:"qr_code"`
	Status string `json:"status"`
}

type registerResponse struct {
	OrderID string        `json:"order_id"`
	Tickets []ticketBrief `json:"tickets"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("id")
	if !isUUID(eventID) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	var req registerRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !isUUID(req.TicketTypeID) {
		writeError(w, http.StatusBadRequest, "ticket_type_id is required")
		return
	}
	if req.Quantity < 1 || req.Quantity > maxTicketsPerOrder {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("quantity must be between 1 and %d", maxTicketsPerOrder))
		return
	}

	ctx := r.Context()
	userID := claimsFrom(ctx).Subject

	ev, err := s.loadEvent(ctx, eventID)
	if err != nil {
		notFoundOr500(w, "register: load event", "event", err)
		return
	}
	if !s.canSeeEvent(ctx, ev, claimsFrom(ctx)) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if msg := registrationBlocked(ev, time.Now()); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		log.Printf("register: begin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())

	var price, left int
	var closesAt *time.Time
	err = tx.QueryRow(ctx, `
		SELECT tt.price, tt.quantity_left,
		       NULLIF(e.registration_closes_at::text, '')::timestamptz
		FROM ticket_types tt
		JOIN events e ON e.id = tt.event_id
		WHERE tt.id = $1 AND tt.event_id = $2
		FOR UPDATE OF tt`,
		req.TicketTypeID, eventID,
	).Scan(&price, &left, &closesAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "ticket type not found for this event")
		return
	}
	if err != nil {
		log.Printf("register: lock ticket type: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if closesAt != nil && time.Now().After(*closesAt) {
		writeError(w, http.StatusBadRequest, "registration for this event is closed")
		return
	}
	if price > 0 {
		writeError(w, http.StatusBadRequest, "this is a paid ticket; buy it through checkout")
		return
	}
	if left < req.Quantity {
		writeError(w, http.StatusConflict, fmt.Sprintf("not enough tickets left (%d remaining)", left))
		return
	}

	tag, err := tx.Exec(ctx, `
		UPDATE ticket_types SET quantity_left = quantity_left - $1
		WHERE id = $2 AND quantity_left >= $1`,
		req.Quantity, req.TicketTypeID)
	if err != nil {
		log.Printf("register: decrement: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() != 1 {
		writeError(w, http.StatusConflict, "not enough tickets left")
		return
	}

	var orderID string
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (user_id, event_id, total_amount, status)
		VALUES ($1, $2, $3, 'completed')
		RETURNING id`,
		userID, eventID, price*req.Quantity,
	).Scan(&orderID)
	if err != nil {
		log.Printf("register: insert order: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	tickets := make([]ticketBrief, 0, req.Quantity)
	for i := 0; i < req.Quantity; i++ {
		qr, err := newQRCode()
		if err != nil {
			log.Printf("register: qr: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		tk := ticketBrief{QRCode: qr}
		err = tx.QueryRow(ctx, `
			INSERT INTO tickets (order_id, event_id, ticket_type_id, user_id, qr_code, price_paid)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, status`,
			orderID, eventID, req.TicketTypeID, userID, qr, price,
		).Scan(&tk.ID, &tk.Status)
		if err != nil {
			log.Printf("register: insert ticket: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		tickets = append(tickets, tk)
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("register: commit: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	s.sendOrderConfirmation(ctx, userID, ev, orderID, tickets)
	writeJSON(w, http.StatusCreated, registerResponse{OrderID: orderID, Tickets: tickets})
}

type ticketEvent struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Date     string `json:"date"`
	Venue    string `json:"venue"`
	ImageURL string `json:"image_url"`
	Status   string `json:"status"`
}

type ticketTypeBrief struct {
	Name  string `json:"name"`
	Price int    `json:"price"`
}

type ticketView struct {
	ID          string          `json:"id"`
	QRCode      string          `json:"qr_code"`
	Status      string          `json:"status"`
	Event       ticketEvent     `json:"event"`
	TicketType  ticketTypeBrief `json:"ticket_type"`
	CheckedInAt *string         `json:"checked_in_at,omitempty"`
}

const ticketSelect = `
	SELECT t.id, t.qr_code, t.status, t.checked_in_at,
	       e.id, e.title, e.date::text::timestamptz, COALESCE(e.venue, ''), e.image_url, e.status,
	       tt.name, tt.price`

const ticketFrom = `
	FROM tickets t
	JOIN events e        ON e.id  = t.event_id
	JOIN ticket_types tt ON tt.id = t.ticket_type_id`

type rowScanner interface{ Scan(dest ...any) error }

func scanTicket(row rowScanner, extra ...any) (ticketView, error) {
	var v ticketView
	var eventDate time.Time
	var checkedInAt *time.Time
	dest := []any{
		&v.ID, &v.QRCode, &v.Status, &checkedInAt,
		&v.Event.ID, &v.Event.Title, &eventDate, &v.Event.Venue, &v.Event.ImageURL, &v.Event.Status,
		&v.TicketType.Name, &v.TicketType.Price,
	}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		return v, err
	}
	v.Event.Date = eventDate.UTC().Format(time.RFC3339)
	if checkedInAt != nil {
		s := checkedInAt.UTC().Format(time.RFC3339)
		v.CheckedInAt = &s
	}
	return v, nil
}

func (s *Server) handleMyTickets(w http.ResponseWriter, r *http.Request) {
	userID := claimsFrom(r.Context()).Subject

	rows, err := s.db.Query(r.Context(),
		ticketSelect+ticketFrom+` WHERE t.user_id = $1 ORDER BY t.created_at DESC, t.id`, userID)
	if err != nil {
		log.Printf("my-tickets: query: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	out := []ticketView{}
	for rows.Next() {
		v, err := scanTicket(rows)
		if err != nil {
			log.Printf("my-tickets: scan: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		log.Printf("my-tickets: rows: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

type checkinRequest struct {
	EventID string `json:"event_id"`
	QRCode  string `json:"qr_code"`
}

type checkinTicket struct {
	ticketView
	AttendeeName string `json:"attendee_name"`
}

type checkinResponse struct {
	Result string         `json:"result"`
	Ticket *checkinTicket `json:"ticket"`
}

func (s *Server) handleCheckin(w http.ResponseWriter, r *http.Request) {
	var req checkinRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	qr := strings.TrimSpace(req.QRCode)
	if qr == "" {
		writeError(w, http.StatusBadRequest, "qr_code is required")
		return
	}
	if !isUUID(req.EventID) {
		writeError(w, http.StatusBadRequest, "event_id is required")
		return
	}
	if len(qr) > maxQRCodeLen {
		writeJSON(w, http.StatusOK, checkinResponse{Result: "invalid"})
		return
	}

	ctx := r.Context()
	adminID := claimsFrom(ctx).Subject

	// Only the event's organizer and staff assigned to it may check tickets in.
	allowed, exists, err := s.canCheckIn(ctx, adminID, req.EventID)
	if err != nil {
		log.Printf("checkin: access: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you are not assigned to this event")
		return
	}

	// A ticket for another event is reported as invalid, without its details.
	tag, err := s.db.Exec(ctx, `
		UPDATE tickets
		SET status = 'checked_in', checked_in_at = now(), checked_in_by = $2
		WHERE qr_code = $1 AND event_id = $3 AND status = 'valid'`,
		qr, adminID, req.EventID)
	if err != nil {
		log.Printf("checkin: update: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	firstScan := tag.RowsAffected() == 1

	var attendee string
	v, err := scanTicket(s.db.QueryRow(ctx,
		ticketSelect+`, u.full_name`+ticketFrom+`
		JOIN users u ON u.id = t.user_id
		WHERE t.qr_code = $1 AND t.event_id = $2`, qr, req.EventID), &attendee)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, checkinResponse{Result: "invalid"})
		return
	}
	if err != nil {
		log.Printf("checkin: load: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	ticket := &checkinTicket{ticketView: v, AttendeeName: attendee}

	switch {
	case firstScan:
		writeJSON(w, http.StatusOK, checkinResponse{Result: "valid", Ticket: ticket})
	case v.Status == "checked_in":
		writeJSON(w, http.StatusOK, checkinResponse{Result: "already_used", Ticket: ticket})
	default:
		writeJSON(w, http.StatusOK, checkinResponse{Result: "invalid", Ticket: ticket})
	}
}

type undoCheckinRequest struct {
	EventID  string `json:"event_id"`
	TicketID string `json:"ticket_id"`
}

type undoCheckinResponse struct {
	TicketID string `json:"ticket_id"`
	Status   string `json:"status"`
}

// POST /api/checkin/undo { event_id, ticket_id } -> { ticket_id, status: "valid" }
//
// Reverses an accidental check-in (SRS 4.8): the ticket is valid again and can be scanned.
// Same access rule as /api/checkin: the event's organizer and staff assigned to it.
// 404 if the ticket does not belong to the event, 409 if it is not checked in.
func (s *Server) handleUndoCheckin(w http.ResponseWriter, r *http.Request) {
	var req undoCheckinRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !isUUID(req.EventID) {
		writeError(w, http.StatusBadRequest, "event_id is required")
		return
	}
	if !isUUID(req.TicketID) {
		writeError(w, http.StatusBadRequest, "ticket_id is required")
		return
	}

	ctx := r.Context()
	adminID := claimsFrom(ctx).Subject

	allowed, exists, err := s.canCheckIn(ctx, adminID, req.EventID)
	if err != nil {
		internalError(w, "undo checkin: access", err)
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you are not assigned to this event")
		return
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "undo checkin: begin", err)
		return
	}
	defer tx.Rollback(context.Background())

	// Lock the ticket so two undos, or an undo and a scan, cannot interleave.
	var status, attendee, typeName string
	err = tx.QueryRow(ctx, `
		SELECT t.status, u.full_name, tt.name
		FROM tickets t
		JOIN users u         ON u.id  = t.user_id
		JOIN ticket_types tt ON tt.id = t.ticket_type_id
		WHERE t.id = $1 AND t.event_id = $2
		FOR UPDATE OF t`, req.TicketID, req.EventID).Scan(&status, &attendee, &typeName)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}
	if err != nil {
		internalError(w, "undo checkin: load", err)
		return
	}
	if status != "checked_in" {
		writeError(w, http.StatusConflict, "ticket is not checked in")
		return
	}

	who := attendee + " (" + typeName + ")"

	// The event history lists a check-in from the ticket's own checked_in_at, which is cleared
	// below. Keep that check-in in the audit log first, with its original time and scanner,
	// so the timeline reads "Checked in" and then "Check-in undone" (SRS 4.16).
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_log (at, actor_id, event_id, category, action, target_id, message)
		SELECT COALESCE(t.checked_in_at, now()), t.checked_in_by, t.event_id,
		       'checkin', 'checkin.scan', t.id::text, $2
		FROM tickets t WHERE t.id = $1`, req.TicketID, "Checked in: "+who); err != nil {
		internalError(w, "undo checkin: keep check-in", err)
		return
	}
	if _, err := tx.Exec(ctx, `
		UPDATE tickets SET status = 'valid', checked_in_at = NULL, checked_in_by = NULL
		WHERE id = $1 AND status = 'checked_in'`, req.TicketID); err != nil {
		internalError(w, "undo checkin: update", err)
		return
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: adminID, EventID: req.EventID, Category: "checkin",
		Action: "checkin.undo", TargetID: req.TicketID, Message: "Check-in undone: " + who}); err != nil {
		internalError(w, "undo checkin: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "undo checkin: commit", err)
		return
	}
	writeJSON(w, http.StatusOK, undoCheckinResponse{TicketID: req.TicketID, Status: "valid"})
}

// registrationBlocked explains why nobody can get tickets for ev right now ("" = open).
// Used by free registration and by checkout.
func registrationBlocked(ev Event, now time.Time) string {
	switch {
	case ev.Status == "cancelled":
		return "this event was cancelled"
	case ev.Status != "published":
		return "this event is not published yet"
	case ev.Suspended:
		return "ticket sales for this event are paused by BiletFlow"
	case ev.RegistrationOpens != nil && now.Before(*ev.RegistrationOpens):
		return "registration for this event has not opened yet"
	case ev.RegistrationCloses != nil && now.After(*ev.RegistrationCloses):
		return "registration for this event is closed"
	case now.After(ev.Date):
		return "this event has already started"
	}
	return ""
}
