package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const schemaAlterCore = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN ('draft','published','cancelled'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_visibility_check;
ALTER TABLE events ADD CONSTRAINT events_visibility_check CHECK (visibility IN ('public','unlisted','private'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_address TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS refund_policy TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS paid_sales TEXT NOT NULL DEFAULT 'none';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_paid_sales_check;
ALTER TABLE events ADD CONSTRAINT events_paid_sales_check CHECK (paid_sales IN ('none','active','stopped'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS fee_paid BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS activation_requested_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
	CHECK (status IN ('pending','completed','failed','cancelled','refunded'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_campaign_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS audit_log (
	id          BIGSERIAL PRIMARY KEY,
	at          TIMESTAMPTZ NOT NULL DEFAULT now(),
	actor_id    UUID REFERENCES users(id),
	event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
	category    TEXT NOT NULL,
	action      TEXT NOT NULL,
	target_id   TEXT NOT NULL DEFAULT '',
	reason      TEXT NOT NULL DEFAULT '',
	message     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log (event_id, at);
`

func init() {
	alterSchemas = append(alterSchemas, schemaAlterCore)
}

var kzZone = time.FixedZone("UTC+5", 5*60*60)

const kzFeeKZT = 5000

type flexTime struct {
	time.Time
	Set bool
}

func (f *flexTime) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		*f = flexTime{}
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	s = strings.TrimSpace(s)
	if s == "" {
		*f = flexTime{}
		return nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		*f = flexTime{Time: t, Set: true}
		return nil
	}
	for _, layout := range []string{"2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02"} {
		if t, err := time.ParseInLocation(layout, s, kzZone); err == nil {
			*f = flexTime{Time: t, Set: true}
			return nil
		}
	}
	return fmt.Errorf("invalid time %q", s)
}

func (f flexTime) ptr() *time.Time {
	if !f.Set {
		return nil
	}
	t := f.Time
	return &t
}

func (s *Server) optionalClaims(r *http.Request) *Claims {
	tokenStr, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || tokenStr == "" {
		return nil
	}
	claims := &Claims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		return s.cfg.JWTSecret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !tok.Valid {
		return nil
	}
	return claims
}

type dbtx interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type auditEntry struct {
	ActorID  string
	EventID  string
	Category string
	Action   string
	TargetID string
	Reason   string
	Message  string
}

func writeAudit(ctx context.Context, db dbtx, e auditEntry) error {
	var actor, event any
	if e.ActorID != "" {
		actor = e.ActorID
	}
	if e.EventID != "" {
		event = e.EventID
	}
	_, err := db.Exec(ctx, `
		INSERT INTO audit_log (actor_id, event_id, category, action, target_id, reason, message)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		actor, event, e.Category, e.Action, e.TargetID, e.Reason, e.Message)
	return err
}

func internalError(w http.ResponseWriter, where string, err error) {
	log.Printf("%s: %v", where, err)
	writeError(w, http.StatusInternalServerError, "internal error")
}

func notFoundOr500(w http.ResponseWriter, where, what string, err error) {
	if errors.Is(err, pgx.ErrNoRows) || isBadUUID(err) {
		writeError(w, http.StatusNotFound, what+" not found")
		return
	}
	internalError(w, where, err)
}

type reasonRequest struct {
	Reason string `json:"reason"`
}

func readReason(w http.ResponseWriter, r *http.Request, required bool) (string, bool) {
	var req reasonRequest
	if r.ContentLength != 0 {
		if !decodeJSON(w, r, &req) {
			return "", false
		}
	}
	reason := strings.TrimSpace(req.Reason)
	if len(reason) > 500 {
		writeError(w, http.StatusBadRequest, "reason is too long (max 500 characters)")
		return "", false
	}
	if required && reason == "" {
		writeError(w, http.StatusBadRequest, "reason is required")
		return "", false
	}
	return reason, true
}

type eventInfo struct {
	ID          string
	OrganizerID string
	Title       string
	Status      string
	Visibility  string
	Suspended   bool
	PaidSales   string
	Date        time.Time
	Capacity    int
}

func loadEventInfo(ctx context.Context, db dbtx, id string, forUpdate bool) (eventInfo, error) {
	var e eventInfo
	if !isUUID(id) {
		return e, pgx.ErrNoRows
	}
	q := `SELECT id, organizer_id, title, status, visibility, suspended, paid_sales, date, capacity
	      FROM events WHERE id = $1`
	if forUpdate {
		q += ` FOR UPDATE`
	}
	err := db.QueryRow(ctx, q, id).Scan(&e.ID, &e.OrganizerID, &e.Title, &e.Status, &e.Visibility,
		&e.Suspended, &e.PaidSales, &e.Date, &e.Capacity)
	return e, err
}

func (s *Server) ownedEvent(w http.ResponseWriter, r *http.Request, id string) (eventInfo, bool) {
	e, err := loadEventInfo(r.Context(), s.db, id, false)
	if err != nil {
		notFoundOr500(w, "load event", "event", err)
		return e, false
	}
	if e.OrganizerID != claimsFrom(r.Context()).Subject {
		writeError(w, http.StatusForbidden, "you do not own this event")
		return e, false
	}
	return e, true
}

func userName(ctx context.Context, db dbtx, id string) string {
	var name string
	_ = db.QueryRow(ctx, `SELECT full_name FROM users WHERE id = $1`, id).Scan(&name)
	return name
}

func kztText(n int) string {
	s := fmt.Sprintf("%d", n)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	return b.String() + " ₸"
}
