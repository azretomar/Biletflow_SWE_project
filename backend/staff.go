package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Staff assignment (SRS 4.8, 6 "Staff Assignment"): an organizer authorizes
// users to check tickets in for one of their events. Check-in is allowed only
// for the event's organizer and the staff assigned to that event.
const schemaStaff = `
CREATE TABLE IF NOT EXISTS event_staff (
	event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	assigned_by UUID NOT NULL REFERENCES users(id),
	created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_staff_user ON event_staff (user_id);
`

func init() {
	schemas = append(schemas, schemaStaff)
}

func (s *Server) registerStaffRoutes(mux *http.ServeMux) {
	organizerOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("organizer")(h))
	}
	mux.Handle("GET /api/events/{id}/staff", organizerOnly(s.handleListStaff))
	mux.Handle("POST /api/events/{id}/staff", organizerOnly(s.handleAssignStaff))
	mux.Handle("DELETE /api/events/{id}/staff/{userId}", organizerOnly(s.handleRemoveStaff))
	mux.Handle("GET /api/staff/events",
		s.requireAuth(s.requireRole("event_admin", "organizer")(http.HandlerFunc(s.handleStaffEvents))))
	mux.Handle("GET /api/staff/events/{id}/attendees",
		s.requireAuth(s.requireRole("event_admin", "organizer")(http.HandlerFunc(s.handleStaffAttendees))))
}

type staffMember struct {
	UserID     string    `json:"user_id"`
	Email      string    `json:"email"`
	FullName   string    `json:"full_name"`
	AssignedAt time.Time `json:"assigned_at"`
}

// requireEventOwner writes 404/403 and returns false unless the caller organizes the event.
func (s *Server) requireEventOwner(w http.ResponseWriter, r *http.Request, eventID string) bool {
	if !isUUID(eventID) {
		writeError(w, http.StatusNotFound, "event not found")
		return false
	}
	var organizerID string
	err := s.db.QueryRow(r.Context(),
		`SELECT organizer_id FROM events WHERE id = $1`, eventID).Scan(&organizerID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "event not found")
		return false
	}
	if err != nil {
		log.Printf("staff: load event: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return false
	}
	if organizerID != claimsFrom(r.Context()).Subject {
		writeError(w, http.StatusForbidden, "you do not own this event")
		return false
	}
	return true
}

// canCheckIn reports whether the user organizes the event or is assigned to it.
// exists is false when the event does not exist.
func (s *Server) canCheckIn(ctx context.Context, userID, eventID string) (allowed, exists bool, err error) {
	err = s.db.QueryRow(ctx, `
		SELECT e.organizer_id = $1
		       OR EXISTS (SELECT 1 FROM event_staff es WHERE es.event_id = e.id AND es.user_id = $1)
		FROM events e WHERE e.id = $2`, userID, eventID,
	).Scan(&allowed)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, false, nil
	}
	if err != nil {
		return false, false, err
	}
	return allowed, true, nil
}

// GET /api/events/{id}/staff  (organizer who owns the event)
func (s *Server) handleListStaff(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("id")
	if !s.requireEventOwner(w, r, eventID) {
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT u.id, u.email, u.full_name, es.created_at
		FROM event_staff es
		JOIN users u ON u.id = es.user_id
		WHERE es.event_id = $1
		ORDER BY es.created_at, u.id`, eventID)
	if err != nil {
		log.Printf("staff list: query: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	list := []staffMember{}
	for rows.Next() {
		var m staffMember
		if err := rows.Scan(&m.UserID, &m.Email, &m.FullName, &m.AssignedAt); err != nil {
			log.Printf("staff list: scan: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		list = append(list, m)
	}
	if err := rows.Err(); err != nil {
		log.Printf("staff list: rows: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

type assignStaffRequest struct {
	Email string `json:"email"`
}

// POST /api/events/{id}/staff  (organizer who owns the event)
//
// Assigns a registered user by email. An attendee becomes an event_admin
// (SRS 1.3: an Event Admin is an organizer-authorized user); the new role
// is in their token after they log in again.
func (s *Server) handleAssignStaff(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("id")
	var req assignStaffRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := mail.ParseAddress(email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid email address")
		return
	}
	if !s.requireEventOwner(w, r, eventID) {
		return
	}

	ctx := r.Context()
	organizerID := claimsFrom(ctx).Subject

	tx, err := s.db.Begin(ctx)
	if err != nil {
		log.Printf("staff assign: begin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer tx.Rollback(context.Background())

	var m staffMember
	var role string
	err = tx.QueryRow(ctx,
		`SELECT id, email, full_name, role FROM users WHERE email = $1 FOR UPDATE`, email,
	).Scan(&m.UserID, &m.Email, &m.FullName, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "no user with this email; ask them to sign up first")
		return
	}
	if err != nil {
		log.Printf("staff assign: load user: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if m.UserID == organizerID {
		writeError(w, http.StatusBadRequest, "you already manage this event")
		return
	}
	if role == "platform_admin" {
		writeError(w, http.StatusBadRequest, "platform admins cannot be assigned as event staff")
		return
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO event_staff (event_id, user_id, assigned_by)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
		RETURNING created_at`,
		eventID, m.UserID, organizerID,
	).Scan(&m.AssignedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusConflict, "user is already assigned to this event")
		return
	}
	if err != nil {
		log.Printf("staff assign: insert: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if role == "attendee" {
		if _, err := tx.Exec(ctx,
			`UPDATE users SET role = 'event_admin' WHERE id = $1`, m.UserID); err != nil {
			log.Printf("staff assign: promote: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("staff assign: commit: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

// DELETE /api/events/{id}/staff/{userId}  (organizer who owns the event)
func (s *Server) handleRemoveStaff(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("id")
	userID := r.PathValue("userId")
	if !s.requireEventOwner(w, r, eventID) {
		return
	}
	if !isUUID(userID) {
		writeError(w, http.StatusNotFound, "staff member not found")
		return
	}
	tag, err := s.db.Exec(r.Context(),
		`DELETE FROM event_staff WHERE event_id = $1 AND user_id = $2`, eventID, userID)
	if err != nil {
		log.Printf("staff remove: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "staff member not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type staffEvent struct {
	ID    string    `json:"id"`
	Title string    `json:"title"`
	Date  time.Time `json:"date"`
	Venue string    `json:"venue"`
	// "organizer" for the caller's own events, "staff" for assigned ones.
	Access string `json:"access"`
}

// GET /api/staff/events  (event_admin, organizer)
// Events the caller may check tickets in for; used by the mobile app.
func (s *Server) handleStaffEvents(w http.ResponseWriter, r *http.Request) {
	userID := claimsFrom(r.Context()).Subject
	rows, err := s.db.Query(r.Context(), `
		SELECT e.id, e.title, e.date, e.venue,
		       CASE WHEN e.organizer_id = $1 THEN 'organizer' ELSE 'staff' END
		FROM events e
		WHERE e.organizer_id = $1
		   OR EXISTS (SELECT 1 FROM event_staff es WHERE es.event_id = e.id AND es.user_id = $1)
		ORDER BY e.date ASC, e.id`, userID)
	if err != nil {
		log.Printf("staff events: query: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	list := []staffEvent{}
	for rows.Next() {
		var e staffEvent
		if err := rows.Scan(&e.ID, &e.Title, &e.Date, &e.Venue, &e.Access); err != nil {
			log.Printf("staff events: scan: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		list = append(list, e)
	}
	if err := rows.Err(); err != nil {
		log.Printf("staff events: rows: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

const maxStaffSearchResults = 50

type staffAttendee struct {
	TicketID    string     `json:"ticket_id"`
	QRCode      string     `json:"qr_code"`
	FullName    string     `json:"full_name"`
	Email       string     `json:"email"`
	TicketType  string     `json:"ticket_type"`
	Status      string     `json:"status"`
	CheckedInAt *time.Time `json:"checked_in_at"`
}

type staffAttendeesResponse struct {
	Registered int             `json:"registered"`
	CheckedIn  int             `json:"checked_in"`
	Attendees  []staffAttendee `json:"attendees"`
}

// GET /api/staff/events/{id}/attendees?q=  (event's organizer or assigned staff)
// Entrance counter and manual attendee search when a QR code cannot be scanned (SRS 4.8).
// Registered counts tickets that still give entry (valid or checked in). The QR code is
// returned so the app can check the ticket in through POST /api/checkin.
func (s *Server) handleStaffAttendees(w http.ResponseWriter, r *http.Request) {
	eventID := r.PathValue("id")
	if !isUUID(eventID) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	ctx := r.Context()
	allowed, exists, err := s.canCheckIn(ctx, claimsFrom(ctx).Subject, eventID)
	if err != nil {
		log.Printf("staff attendees: access: %v", err)
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

	var resp staffAttendeesResponse
	if err := s.db.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE status IN ('valid','checked_in')),
		       COUNT(*) FILTER (WHERE status = 'checked_in')
		FROM tickets WHERE event_id = $1`, eventID).Scan(&resp.Registered, &resp.CheckedIn); err != nil {
		log.Printf("staff attendees: counts: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	resp.Attendees = []staffAttendee{}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if len(q) > 100 {
		q = q[:100]
	}
	// Escape LIKE wildcards so a search for "%" matches a literal percent sign.
	pattern := "%" + strings.NewReplacer(`\`, `\`, `%`, `\%`, `_`, `\_`).Replace(strings.ToLower(q)) + "%"
	rows, err := s.db.Query(ctx, `
		SELECT t.id, t.qr_code, u.full_name, u.email, tt.name, t.status, t.checked_in_at
		FROM tickets t
		JOIN users u         ON u.id  = t.user_id
		JOIN ticket_types tt ON tt.id = t.ticket_type_id
		WHERE t.event_id = $1
		  AND (lower(u.full_name) LIKE $2 OR lower(u.email) LIKE $2)
		ORDER BY u.full_name, t.created_at, t.id
		LIMIT $3`, eventID, pattern, maxStaffSearchResults)
	if err != nil {
		log.Printf("staff attendees: query: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var a staffAttendee
		if err := rows.Scan(&a.TicketID, &a.QRCode, &a.FullName, &a.Email, &a.TicketType, &a.Status, &a.CheckedInAt); err != nil {
			log.Printf("staff attendees: scan: %v", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		resp.Attendees = append(resp.Attendees, a)
	}
	if err := rows.Err(); err != nil {
		log.Printf("staff attendees: rows: %v", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
