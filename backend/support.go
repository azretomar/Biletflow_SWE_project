package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Asynchronous support chat (SRS 4.13). A user sees only their own cases;
// platform admins see all of them.
const schemaSupport = `
CREATE TABLE IF NOT EXISTS support_cases (
	id           BIGSERIAL PRIMARY KEY,
	user_id      UUID NOT NULL REFERENCES users(id),
	category     TEXT NOT NULL,
	subject      TEXT NOT NULL,
	status       TEXT NOT NULL DEFAULT 'open'
	             CHECK (status IN ('open','in_progress','waiting','resolved')),
	context_type TEXT CHECK (context_type IN ('event','order','ticket')),
	context_id   TEXT,
	assignee_id  UUID REFERENCES users(id),
	created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_cases_user ON support_cases (user_id);

CREATE TABLE IF NOT EXISTS support_messages (
	id         BIGSERIAL PRIMARY KEY,
	case_id    BIGINT NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
	author_id  UUID NOT NULL REFERENCES users(id),
	body       TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_case ON support_messages (case_id, created_at);
`

func init() {
	schemas = append(schemas, schemaSupport)
}

var supportCategories = map[string]bool{
	"tickets": true, "payment": true, "event": true, "account": true, "organizer": true, "other": true,
}

var caseStatuses = map[string]bool{"open": true, "in_progress": true, "waiting": true, "resolved": true}

func (s *Server) registerSupportRoutes(mux *http.ServeMux) {
	auth := func(h http.HandlerFunc) http.Handler { return s.requireAuth(h) }
	adminOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("platform_admin")(h))
	}
	mux.Handle("GET /api/support/cases", auth(s.handleMyCases))
	mux.Handle("POST /api/support/cases", auth(s.handleCreateCase))
	mux.Handle("GET /api/support/cases/{id}", auth(s.handleGetMyCase))
	mux.Handle("POST /api/support/cases/{id}/messages", auth(s.handleMyCaseMessage))
	mux.Handle("GET /api/admin/support/cases", adminOnly(s.handleAdminCases))
	mux.Handle("GET /api/admin/support/cases/{id}", adminOnly(s.handleAdminGetCase))
	mux.Handle("PATCH /api/admin/support/cases/{id}", adminOnly(s.handleAdminPatchCase))
	mux.Handle("POST /api/admin/support/cases/{id}/messages", adminOnly(s.handleAdminCaseMessage))

	// Organizer inbox: cases about the organizer's own events (SRS 4.13, UC9).
	organizerOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("organizer")(h))
	}
	mux.Handle("GET /api/organizer/support/cases", organizerOnly(s.handleOrganizerCases))
	mux.Handle("GET /api/organizer/support/cases/{id}", organizerOnly(s.handleOrganizerGetCase))
	mux.Handle("PATCH /api/organizer/support/cases/{id}", organizerOnly(s.handleOrganizerPatchCase))
	mux.Handle("POST /api/organizer/support/cases/{id}/messages", organizerOnly(s.handleOrganizerCaseMessage))
}

type caseContext struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type caseUser struct {
	ID       string `json:"id,omitempty"`
	FullName string `json:"full_name"`
	Email    string `json:"email,omitempty"`
}

type caseMessage struct {
	ID         int64     `json:"id"`
	AuthorName string    `json:"author_name"`
	AuthorRole string    `json:"author_role"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

// caseEvent is the organizer's event a case is about (organizer inbox only).
type caseEvent struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type supportCase struct {
	ID        int64         `json:"id"`
	Subject   string        `json:"subject"`
	Status    string        `json:"status"`
	Category  string        `json:"category"`
	Context   *caseContext  `json:"context"`
	Event     *caseEvent    `json:"event,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
	Requester *caseUser     `json:"requester,omitempty"`
	Assignee  *caseUser     `json:"assignee"`
	Messages  []caseMessage `json:"messages,omitempty"`
	userID    string
}

const caseColumns = `c.id, c.subject, c.status, c.category, c.context_type, c.context_id, c.created_at, c.updated_at,
	       c.user_id, ru.full_name, ru.email, c.assignee_id, COALESCE(au.full_name, '')`

const caseFrom = `
	FROM support_cases c
	JOIN users ru ON ru.id = c.user_id
	LEFT JOIN users au ON au.id = c.assignee_id`

const caseSelect = `
	SELECT ` + caseColumns + caseFrom

// scanCase scans the caseColumns, followed by any extra columns.
func scanCase(row rowScanner, extra ...any) (supportCase, error) {
	var c supportCase
	var ctxType, ctxID, assigneeID *string
	var req caseUser
	var assigneeName string
	dest := []any{&c.ID, &c.Subject, &c.Status, &c.Category, &ctxType, &ctxID, &c.CreatedAt, &c.UpdatedAt,
		&c.userID, &req.FullName, &req.Email, &assigneeID, &assigneeName}
	err := row.Scan(append(dest, extra...)...)
	if err != nil {
		return c, err
	}
	if ctxType != nil && ctxID != nil {
		c.Context = &caseContext{Type: *ctxType, ID: *ctxID}
	}
	req.ID = c.userID
	c.Requester = &req
	if assigneeID != nil {
		c.Assignee = &caseUser{ID: *assigneeID, FullName: assigneeName}
	}
	return c, nil
}

func (s *Server) listCases(ctx context.Context, where string, args ...any) ([]supportCase, error) {
	rows, err := s.db.Query(ctx, caseSelect+` WHERE `+where+` ORDER BY c.updated_at DESC, c.id DESC LIMIT 500`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []supportCase{}
	for rows.Next() {
		c, err := scanCase(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func (s *Server) loadCase(ctx context.Context, id string) (supportCase, error) {
	c, err := scanCase(s.db.QueryRow(ctx, caseSelect+` WHERE c.id = $1`, id))
	if err != nil {
		return c, err
	}
	return c, s.loadMessages(ctx, &c)
}

// loadMessages fills c.Messages with the case's thread, oldest first.
func (s *Server) loadMessages(ctx context.Context, c *supportCase) error {
	rows, err := s.db.Query(ctx, `
		SELECT m.id, u.full_name, u.role, m.body, m.created_at
		FROM support_messages m JOIN users u ON u.id = m.author_id
		WHERE m.case_id = $1 ORDER BY m.created_at, m.id`, c.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	c.Messages = []caseMessage{}
	for rows.Next() {
		var m caseMessage
		if err := rows.Scan(&m.ID, &m.AuthorName, &m.AuthorRole, &m.Body, &m.CreatedAt); err != nil {
			return err
		}
		c.Messages = append(c.Messages, m)
	}
	return rows.Err()
}

// caseID returns the numeric case id from the path, or "" if it is not a number.
func caseID(r *http.Request) string {
	id := r.PathValue("id")
	if id == "" || len(id) > 18 || strings.Trim(id, "0123456789") != "" {
		return ""
	}
	return id
}

// GET /api/support/cases - the caller's own cases.
func (s *Server) handleMyCases(w http.ResponseWriter, r *http.Request) {
	list, err := s.listCases(r.Context(), "c.user_id = $1", claimsFrom(r.Context()).Subject)
	if err != nil {
		internalError(w, "my cases", err)
		return
	}
	for i := range list {
		list[i].Requester = nil
	}
	writeJSON(w, http.StatusOK, list)
}

type createCaseRequest struct {
	Category string       `json:"category"`
	Subject  string       `json:"subject"`
	Message  string       `json:"message"`
	Context  *caseContext `json:"context"`
}

// POST /api/support/cases
func (s *Server) handleCreateCase(w http.ResponseWriter, r *http.Request) {
	var req createCaseRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Subject, req.Message = strings.TrimSpace(req.Subject), strings.TrimSpace(req.Message)
	switch {
	case !supportCategories[req.Category]:
		writeError(w, http.StatusBadRequest, "choose a topic")
		return
	case req.Subject == "" || len(req.Subject) > 200:
		writeError(w, http.StatusBadRequest, "subject is required (max 200 characters)")
		return
	case len(req.Message) < 10 || len(req.Message) > 5000:
		writeError(w, http.StatusBadRequest, "describe the problem in 10 to 5000 characters")
		return
	}
	var ctxType, ctxID any
	if req.Context != nil && req.Context.Type != "" {
		t, id := req.Context.Type, strings.TrimSpace(req.Context.ID)
		if (t != "event" && t != "order" && t != "ticket") || id == "" || len(id) > 100 {
			writeError(w, http.StatusBadRequest, "context must be an event, order or ticket with its id")
			return
		}
		ctxType, ctxID = t, id
	}
	ctx := r.Context()
	userID := claimsFrom(ctx).Subject
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "create case: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	var id int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO support_cases (user_id, category, subject, context_type, context_id)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`, userID, req.Category, req.Subject, ctxType, ctxID).Scan(&id); err != nil {
		internalError(w, "create case: insert", err)
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO support_messages (case_id, author_id, body) VALUES ($1, $2, $3)`,
		id, userID, req.Message); err != nil {
		internalError(w, "create case: message", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "create case: commit", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

// GET /api/support/cases/{id} - only the author.
func (s *Server) handleGetMyCase(w http.ResponseWriter, r *http.Request) {
	id := caseID(r)
	if id == "" {
		writeError(w, http.StatusNotFound, "case not found")
		return
	}
	c, err := s.loadCase(r.Context(), id)
	if err == nil && c.userID != claimsFrom(r.Context()).Subject {
		err = pgx.ErrNoRows
	}
	if err != nil {
		notFoundOr500(w, "get case", "case", err)
		return
	}
	c.Requester = nil
	writeJSON(w, http.StatusOK, c)
}

type messageRequest struct {
	Body string `json:"body"`
}

// addMessage appends a message and moves the case to newStatus (if not "").
func (s *Server) addMessage(ctx context.Context, caseID, authorID, body, newStatus string) (caseMessage, error) {
	var m caseMessage
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return m, err
	}
	defer tx.Rollback(context.Background())
	err = tx.QueryRow(ctx, `
		INSERT INTO support_messages (case_id, author_id, body) VALUES ($1, $2, $3)
		RETURNING id, body, created_at`, caseID, authorID, body).Scan(&m.ID, &m.Body, &m.CreatedAt)
	if err != nil {
		return m, err
	}
	if err := tx.QueryRow(ctx, `SELECT full_name, role FROM users WHERE id = $1`, authorID).Scan(&m.AuthorName, &m.AuthorRole); err != nil {
		return m, err
	}
	if newStatus != "" {
		_, err = tx.Exec(ctx, `UPDATE support_cases SET status = $2, updated_at = now() WHERE id = $1`, caseID, newStatus)
	} else {
		_, err = tx.Exec(ctx, `UPDATE support_cases SET updated_at = now() WHERE id = $1`, caseID)
	}
	if err != nil {
		return m, err
	}
	return m, tx.Commit(ctx)
}

func readMessage(w http.ResponseWriter, r *http.Request) (string, bool) {
	var req messageRequest
	if !decodeJSON(w, r, &req) {
		return "", false
	}
	body := strings.TrimSpace(req.Body)
	if body == "" || len(body) > 5000 {
		writeError(w, http.StatusBadRequest, "write a message (max 5000 characters)")
		return "", false
	}
	return body, true
}

// POST /api/support/cases/{id}/messages - the author replies; a waiting or resolved case opens again.
func (s *Server) handleMyCaseMessage(w http.ResponseWriter, r *http.Request) {
	id := caseID(r)
	if id == "" {
		writeError(w, http.StatusNotFound, "case not found")
		return
	}
	body, ok := readMessage(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	userID := claimsFrom(ctx).Subject
	var owner, status string
	err := s.db.QueryRow(ctx, `SELECT user_id, status FROM support_cases WHERE id = $1`, id).Scan(&owner, &status)
	if err == nil && owner != userID {
		err = pgx.ErrNoRows
	}
	if err != nil {
		notFoundOr500(w, "case message: load", "case", err)
		return
	}
	newStatus := ""
	if status == "waiting" || status == "resolved" {
		newStatus = "open"
	}
	m, err := s.addMessage(ctx, id, userID, body, newStatus)
	if err != nil {
		internalError(w, "case message", err)
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

// GET /api/admin/support/cases?status=
func (s *Server) handleAdminCases(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	var list []supportCase
	var err error
	switch {
	case status == "":
		list, err = s.listCases(r.Context(), "TRUE")
	case caseStatuses[status]:
		list, err = s.listCases(r.Context(), "c.status = $1", status)
	default:
		writeError(w, http.StatusBadRequest, "unknown status")
		return
	}
	if err != nil {
		internalError(w, "admin cases", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/admin/support/cases/{id}
func (s *Server) handleAdminGetCase(w http.ResponseWriter, r *http.Request) {
	id := caseID(r)
	if id == "" {
		writeError(w, http.StatusNotFound, "case not found")
		return
	}
	c, err := s.loadCase(r.Context(), id)
	if err != nil {
		notFoundOr500(w, "admin case", "case", err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

type casePatch struct {
	Status     *string `json:"status"`
	AssignToMe bool    `json:"assign_to_me"`
}

// PATCH /api/admin/support/cases/{id} { status } or { assign_to_me: true }
func (s *Server) handleAdminPatchCase(w http.ResponseWriter, r *http.Request) {
	s.patchCase(w, r, false)
}

// patchCase changes the status and/or the assignee of a case. With organizerScope the
// caller is an organizer, who may only touch cases about their own events (404 otherwise).
func (s *Server) patchCase(w http.ResponseWriter, r *http.Request, organizerScope bool) {
	id := caseID(r)
	if id == "" {
		writeError(w, http.StatusNotFound, "case not found")
		return
	}
	var req casePatch
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Status == nil && !req.AssignToMe {
		writeError(w, http.StatusBadRequest, "send status or assign_to_me")
		return
	}
	if req.Status != nil && !caseStatuses[*req.Status] {
		writeError(w, http.StatusBadRequest, "unknown status")
		return
	}
	ctx := r.Context()
	adminID := claimsFrom(ctx).Subject // the organizer's id in the organizer inbox
	if organizerScope {
		if _, _, err := s.organizerCaseAccess(ctx, adminID, id); err != nil {
			notFoundOr500(w, "patch case: access", "case", err)
			return
		}
	}
	var tag interface{ RowsAffected() int64 }
	var err error
	switch {
	case req.Status != nil && req.AssignToMe:
		tag, err = s.db.Exec(ctx, `UPDATE support_cases SET status = $2, assignee_id = $3, updated_at = now() WHERE id = $1`,
			id, *req.Status, adminID)
	case req.Status != nil:
		tag, err = s.db.Exec(ctx, `UPDATE support_cases SET status = $2, updated_at = now() WHERE id = $1`, id, *req.Status)
	default:
		// Taking a new case also starts work on it.
		tag, err = s.db.Exec(ctx, `UPDATE support_cases SET assignee_id = $2,
			status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = $1`, id, adminID)
	}
	if err != nil {
		internalError(w, "patch case", err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "case not found")
		return
	}
	var c supportCase
	if organizerScope {
		c, err = s.loadOrganizerCase(ctx, adminID, id)
	} else {
		c, err = s.loadCase(ctx, id)
	}
	if err != nil {
		internalError(w, "patch case: reload", err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// POST /api/admin/support/cases/{id}/messages - a staff reply; the case waits for the customer.
func (s *Server) handleAdminCaseMessage(w http.ResponseWriter, r *http.Request) {
	id := caseID(r)
	if id == "" {
		writeError(w, http.StatusNotFound, "case not found")
		return
	}
	body, ok := readMessage(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	var status, email string
	err := s.db.QueryRow(ctx, `SELECT c.status, u.email FROM support_cases c JOIN users u ON u.id = c.user_id
		WHERE c.id = $1`, id).Scan(&status, &email)
	if err != nil {
		notFoundOr500(w, "admin case message: load", "case", err)
		return
	}
	newStatus := ""
	if status != "resolved" {
		newStatus = "waiting"
	}
	m, err := s.addMessage(ctx, id, claimsFrom(ctx).Subject, body, newStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "case not found")
			return
		}
		internalError(w, "admin case message", err)
		return
	}
	sendEmail(email, "BiletFlow support replied to request #"+id, body)
	writeJSON(w, http.StatusCreated, m)
}

const organizerCaseJoin = `
	JOIN LATERAL (
		SELECT e.id, e.title
		FROM (SELECT CASE WHEN c.context_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		                  THEN c.context_id::uuid END AS cid) x,
		     events e
		WHERE e.organizer_id = $1 AND x.cid IS NOT NULL AND (
		      (c.context_type = 'event'  AND e.id = x.cid)
		   OR (c.context_type = 'order'  AND EXISTS (SELECT 1 FROM orders o  WHERE o.id = x.cid AND o.event_id = e.id))
		   OR (c.context_type = 'ticket' AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = x.cid AND t.event_id = e.id)))
		LIMIT 1) ev ON TRUE`

const organizerCaseWhere = `c.category <> 'organizer' AND c.user_id <> $1`

const organizerCaseSelect = `
	SELECT ` + caseColumns + `, ev.id, ev.title` + caseFrom + organizerCaseJoin

// organizerCaseAccess returns the status and the requester's email of a case in the
// organizer's scope, or pgx.ErrNoRows when the organizer may not see it.
func (s *Server) organizerCaseAccess(ctx context.Context, organizerID, id string) (status, email string, err error) {
	err = s.db.QueryRow(ctx, `
		SELECT c.status, ru.email
		FROM support_cases c
		JOIN users ru ON ru.id = c.user_id`+organizerCaseJoin+`
		WHERE c.id = $2 AND `+organizerCaseWhere, organizerID, id).Scan(&status, &email)
	return status, email, err
}

// loadOrganizerCase loads one case in the organizer's scope with its event and messages.
func (s *Server) loadOrganizerCase(ctx context.Context, organizerID, id string) (supportCase, error) {
	var ev caseEvent
	c, err := scanCase(s.db.QueryRow(ctx,
		organizerCaseSelect+` WHERE c.id = $2 AND `+organizerCaseWhere, organizerID, id), &ev.ID, &ev.Title)
	if err != nil {
		return c, err
	}
	c.Event = &ev
	return c, s.loadMessages(ctx, &c)
}

// GET /api/organizer/support/cases?status=&event_id=
func (s *Server) handleOrganizerCases(w http.ResponseWriter, r *http.Request) {
	where := organizerCaseWhere
	args := []any{claimsFrom(r.Context()).Subject}
	if status := r.URL.Query().Get("status"); status != "" {
		if !caseStatuses[status] {
			writeError(w, http.StatusBadRequest, "unknown status")
			return
		}
		args = append(args, status)
		where += fmt.Sprintf(" AND c.status = $%d", len(args))
	}
	if eventID := r.URL.Query().Get("event_id"); eventID != "" {
		if !isUUID(eventID) {
			writeError(w, http.StatusBadRequest, "unknown event_id")
			return
		}
		args = append(args, eventID)
		where += fmt.Sprintf(" AND ev.id = $%d", len(args))
	}
	rows, err := s.db.Query(r.Context(),
		organizerCaseSelect+` WHERE `+where+` ORDER BY c.updated_at DESC, c.id DESC LIMIT 500`, args...)
	if err != nil {
		internalError(w, "organizer cases", err)
		return
	}
	defer rows.Close()
	list := []supportCase{}
	for rows.Next() {
		var ev caseEvent
		c, err := scanCase(rows, &ev.ID, &ev.Title)
		if err != nil {
			internalError(w, "organizer cases: scan", err)
			return
		}
		c.Event = &ev
		list = append(list, c)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "organizer cases: rows", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/organizer/support/cases/{id}
func (s *Server) handleOrganizerGetCase(w http.ResponseWriter, r *http.Request) {
	id := caseID(r)
	if id == "" {
		writeError(w, http.StatusNotFound, "case not found")
		return
	}
	c, err := s.loadOrganizerCase(r.Context(), claimsFrom(r.Context()).Subject, id)
	if err != nil {
		notFoundOr500(w, "organizer case", "case", err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// PATCH /api/organizer/support/cases/{id} { status } or { assign_to_me: true }
func (s *Server) handleOrganizerPatchCase(w http.ResponseWriter, r *http.Request) {
	s.patchCase(w, r, true)
}

// POST /api/organizer/support/cases/{id}/messages - the organizer replies; the case waits for the attendee.
func (s *Server) handleOrganizerCaseMessage(w http.ResponseWriter, r *http.Request) {
	id := caseID(r)
	if id == "" {
		writeError(w, http.StatusNotFound, "case not found")
		return
	}
	body, ok := readMessage(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	organizerID := claimsFrom(ctx).Subject
	status, email, err := s.organizerCaseAccess(ctx, organizerID, id)
	if err != nil {
		notFoundOr500(w, "organizer case message: access", "case", err)
		return
	}
	newStatus := ""
	if status != "resolved" {
		newStatus = "waiting"
	}
	m, err := s.addMessage(ctx, id, organizerID, body, newStatus)
	if err != nil {
		internalError(w, "organizer case message", err)
		return
	}
	sendEmail(email, "The organizer replied to your request #"+id, body)
	writeJSON(w, http.StatusCreated, m)
}
