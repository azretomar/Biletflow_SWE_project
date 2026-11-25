package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Server) registerAdminRoutes(mux *http.ServeMux) {
	adminOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("platform_admin")(h))
	}
	mux.Handle("GET /api/admin/users", adminOnly(s.handleAdminUsers))
	mux.Handle("GET /api/admin/events", adminOnly(s.handleAdminEvents))
	mux.Handle("GET /api/admin/stats", adminOnly(s.handleAdminStats))
	mux.Handle("GET /api/admin/audit", adminOnly(s.handleAdminAudit))
	mux.Handle("POST /api/admin/users/{id}/{action}", adminOnly(s.handleAdminUserAction))
	mux.Handle("POST /api/admin/events/{id}/{action}", adminOnly(s.handleAdminEventAction))
}

type adminUser struct {
	ID            string    `json:"id"`
	FullName      string    `json:"full_name"`
	Email         string    `json:"email"`
	Role          string    `json:"role"`
	Suspended     bool      `json:"suspended"`
	EmailVerified bool      `json:"email_verified"`
	CreatedAt     time.Time `json:"created_at"`
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT id, full_name, email, role, suspended, email_verified, created_at
		FROM users ORDER BY created_at DESC, id`)
	if err != nil {
		internalError(w, "admin users", err)
		return
	}
	defer rows.Close()
	list := []adminUser{}
	for rows.Next() {
		var u adminUser
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &u.Suspended, &u.EmailVerified, &u.CreatedAt); err != nil {
			internalError(w, "admin users: scan", err)
			return
		}
		list = append(list, u)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "admin users: rows", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

type adminReport struct {
	ID        int64     `json:"id"`
	Reason    string    `json:"reason"`
	Reporter  string    `json:"reporter"`
	CreatedAt time.Time `json:"created_at"`
}

type adminActivation struct {
	PaidSales        string     `json:"paid_sales"`
	IdentityVerified bool       `json:"identity_verified"`
	FeePaid          bool       `json:"fee_paid"`
	PayoutAccount    bool       `json:"payout_account"`
	TermsAccepted    bool       `json:"terms_accepted"`
	RequestedAt      *time.Time `json:"requested_at"`
}

type adminEvent struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	OrganizerID string           `json:"organizer_id"`
	Category    string           `json:"category"`
	Venue       string           `json:"venue"`
	StartAt     time.Time        `json:"start_at"`
	Status      string           `json:"status"`
	Visibility  string           `json:"visibility"`
	Suspended   bool             `json:"suspended"`
	Capacity    int              `json:"capacity"`
	TicketsSold int              `json:"tickets_sold"`
	RevenueKZT  int              `json:"revenue_kzt"`
	Reports     []adminReport    `json:"reports"`
	Activation  *adminActivation `json:"activation"`
}

func (s *Server) handleAdminEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := s.db.Query(ctx, `
		SELECT e.id, e.title, e.organizer_id, e.category, e.venue, e.date, e.status, e.visibility, e.suspended,
		       e.capacity,
		       (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('valid','checked_in'))::int,
		       COALESCE((SELECT SUM(o.total_amount) FROM orders o WHERE o.event_id = e.id AND o.status = 'completed'), 0)::int,
		       e.paid_sales, e.identity_verified, e.fee_paid, e.terms_accepted, e.activation_requested_at,
		       COALESCE(p.payout_holder <> '' AND p.payout_bank <> '' AND p.payout_iban <> '', FALSE)
		FROM events e
		LEFT JOIN organizer_profiles p ON p.user_id = e.organizer_id
		ORDER BY e.date DESC, e.id`)
	if err != nil {
		internalError(w, "admin events", err)
		return
	}
	list := []adminEvent{}
	index := map[string]int{}
	var ids []string
	for rows.Next() {
		var e adminEvent
		var a adminActivation
		if err := rows.Scan(&e.ID, &e.Title, &e.OrganizerID, &e.Category, &e.Venue, &e.StartAt, &e.Status,
			&e.Visibility, &e.Suspended, &e.Capacity, &e.TicketsSold, &e.RevenueKZT, &a.PaidSales,
			&a.IdentityVerified, &a.FeePaid, &a.TermsAccepted, &a.RequestedAt, &a.PayoutAccount); err != nil {
			rows.Close()
			internalError(w, "admin events: scan", err)
			return
		}
		if a.RequestedAt != nil || a.PaidSales != "none" {
			if a.PaidSales == "none" {
				a.PaidSales = "pending"
			}
			if a.RequestedAt == nil {
				a.RequestedAt = &e.StartAt
			}
			e.Activation = &a
		}
		e.Reports = []adminReport{}
		index[e.ID] = len(list)
		ids = append(ids, e.ID)
		list = append(list, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		internalError(w, "admin events: rows", err)
		return
	}
	if len(ids) > 0 {
		rrows, err := s.db.Query(ctx, `
			SELECT r.event_id, r.id, r.reason, u.email, r.created_at
			FROM event_reports r JOIN users u ON u.id = r.reporter_id
			WHERE r.event_id = ANY($1) ORDER BY r.created_at`, ids)
		if err != nil {
			internalError(w, "admin events: reports", err)
			return
		}
		defer rrows.Close()
		for rrows.Next() {
			var eventID string
			var rep adminReport
			if err := rrows.Scan(&eventID, &rep.ID, &rep.Reason, &rep.Reporter, &rep.CreatedAt); err != nil {
				internalError(w, "admin events: reports scan", err)
				return
			}
			e := &list[index[eventID]]
			e.Reports = append(e.Reports, rep)
		}
		if err := rrows.Err(); err != nil {
			internalError(w, "admin events: reports rows", err)
			return
		}
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	var failed, users, events, openCases int
	err := s.db.QueryRow(r.Context(), `
		SELECT (SELECT COUNT(*) FROM orders WHERE status = 'failed' AND created_at > now() - interval '7 days')::int,
		       (SELECT COUNT(*) FROM users)::int,
		       (SELECT COUNT(*) FROM events)::int,
		       (SELECT COUNT(*) FROM support_cases WHERE status <> 'resolved')::int`).Scan(&failed, &users, &events, &openCases)
	if err != nil {
		internalError(w, "admin stats", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{
		"failed_payments_7d": failed, "users": users, "events": events, "open_support_cases": openCases,
	})
}

type auditView struct {
	ID       int64     `json:"id"`
	At       time.Time `json:"at"`
	Actor    string    `json:"actor"`
	Category string    `json:"category"`
	Action   string    `json:"action"`
	EventID  *string   `json:"event_id"`
	TargetID string    `json:"target_id"`
	Reason   string    `json:"reason"`
	Message  string    `json:"message"`
}

func (s *Server) handleAdminAudit(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT a.id, a.at, COALESCE(u.email, ''), a.category, a.action, a.event_id, a.target_id, a.reason, a.message
		FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
		ORDER BY a.at DESC, a.id DESC LIMIT 200`)
	if err != nil {
		internalError(w, "admin audit", err)
		return
	}
	defer rows.Close()
	list := []auditView{}
	for rows.Next() {
		var a auditView
		if err := rows.Scan(&a.ID, &a.At, &a.Actor, &a.Category, &a.Action, &a.EventID, &a.TargetID, &a.Reason, &a.Message); err != nil {
			internalError(w, "admin audit: scan", err)
			return
		}
		list = append(list, a)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "admin audit: rows", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleAdminUserAction(w http.ResponseWriter, r *http.Request) {
	action := r.PathValue("action")
	if action != "suspend" && action != "unsuspend" {
		writeError(w, http.StatusNotFound, "unknown action")
		return
	}
	reason, ok := readReason(w, r, true)
	if !ok {
		return
	}
	ctx := r.Context()
	adminID := claimsFrom(ctx).Subject
	id := r.PathValue("id")
	if !isUUID(id) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if id == adminID {
		writeError(w, http.StatusBadRequest, "you cannot suspend your own account")
		return
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "admin user: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	var email, role string
	var suspended bool
	err = tx.QueryRow(ctx, `SELECT email, role, suspended FROM users WHERE id = $1 FOR UPDATE`, id).Scan(&email, &role, &suspended)
	if err != nil {
		notFoundOr500(w, "admin user: load", "user", err)
		return
	}
	want := action == "suspend"
	if role == "platform_admin" && want {
		writeError(w, http.StatusBadRequest, "platform admins cannot be suspended here")
		return
	}
	if suspended == want {
		writeJSON(w, http.StatusOK, map[string]any{"id": id, "suspended": want})
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET suspended = $2 WHERE id = $1`, id, want); err != nil {
		internalError(w, "admin user: update", err)
		return
	}
	verb := "Account suspended"
	if !want {
		verb = "Account unsuspended"
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: adminID, Category: "admin", Action: "user." + action,
		TargetID: id, Reason: reason, Message: verb + ": " + email}); err != nil {
		internalError(w, "admin user: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "admin user: commit", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "suspended": want})
}

func (s *Server) handleAdminEventAction(w http.ResponseWriter, r *http.Request) {
	action := r.PathValue("action")
	switch action {
	case "suspend", "restore", "stop-sales", "resume-sales":
	default:
		writeError(w, http.StatusNotFound, "unknown action")
		return
	}
	reason, ok := readReason(w, r, true)
	if !ok {
		return
	}
	ctx := r.Context()
	adminID := claimsFrom(ctx).Subject
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "admin event: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	info, err := loadEventInfo(ctx, tx, r.PathValue("id"), true)
	if err != nil {
		notFoundOr500(w, "admin event: load", "event", err)
		return
	}
	a, err := loadActivation(ctx, tx, info.ID)
	if err != nil {
		internalError(w, "admin event: activation", err)
		return
	}

	var msg string
	switch action {
	case "suspend":
		if info.Suspended {
			writeError(w, http.StatusConflict, "this event is already suspended")
			return
		}
		_, err = tx.Exec(ctx, `UPDATE events SET suspended = TRUE,
			paid_sales = CASE WHEN paid_sales = 'active' THEN 'stopped' ELSE paid_sales END WHERE id = $1`, info.ID)
		msg = "Event suspended: hidden from attendees and ticket sales stopped"
	case "restore":
		if !info.Suspended {
			writeError(w, http.StatusConflict, "this event is not suspended")
			return
		}
		_, err = tx.Exec(ctx, `UPDATE events SET suspended = FALSE WHERE id = $1`, info.ID)
		msg = "Event restored"
		if info.PaidSales == "stopped" {
			msg += " (paid sales stay stopped until resumed)"
		}
	case "stop-sales":
		if info.PaidSales != "active" {
			writeError(w, http.StatusConflict, "paid sales are not active for this event")
			return
		}
		_, err = tx.Exec(ctx, `UPDATE events SET paid_sales = 'stopped' WHERE id = $1`, info.ID)
		msg = "Paid ticket sales stopped"
	case "resume-sales":
		switch {
		case info.PaidSales != "stopped":
			writeError(w, http.StatusConflict, "paid sales are not stopped for this event")
			return
		case info.Suspended:
			writeError(w, http.StatusConflict, "restore the event before resuming its sales")
			return
		case !a.IdentityVerified || !a.PayoutConnected || !a.FeePaid || !a.TermsAccepted:
			writeError(w, http.StatusConflict, "the organizer has not finished the paid-sales checklist")
			return
		}
		_, err = tx.Exec(ctx, `UPDATE events SET paid_sales = 'active' WHERE id = $1`, info.ID)
		msg = "Paid ticket sales resumed"
	}
	if err != nil {
		internalError(w, "admin event: update", err)
		return
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: adminID, EventID: info.ID, Category: "admin",
		Action: "event." + action, TargetID: info.ID, Reason: reason, Message: msg}); err != nil {
		internalError(w, "admin event: audit", err)
		return
	}
	var suspended bool
	var paidSales string
	if err := tx.QueryRow(ctx, `SELECT suspended, paid_sales FROM events WHERE id = $1`, info.ID).Scan(&suspended, &paidSales); err != nil {
		internalError(w, "admin event: reload", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "admin event: commit", err)
		return
	}
	var organizerEmail string
	if err := s.db.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, info.OrganizerID).Scan(&organizerEmail); err == nil {
		sendEmail(organizerEmail, "BiletFlow: change to your event "+info.Title, fmt.Sprintf("%s. Reason: %s", msg, reason))
	} else if !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("admin event: organizer email: %v", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": info.ID, "suspended": suspended, "paid_sales": paidSales})
}
