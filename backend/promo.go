package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Promo campaigns (SRS 4.14). The server makes the code and checks every discount.
const schemaPromo = `
CREATE TABLE IF NOT EXISTS promo_campaigns (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	organizer_id    UUID NOT NULL REFERENCES users(id),
	event_id        UUID REFERENCES events(id) ON DELETE CASCADE, -- NULL = all of the organizer's events
	name            TEXT NOT NULL,
	code            TEXT NOT NULL UNIQUE,
	discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
	amount          INTEGER NOT NULL CHECK (amount > 0),
	starts_at       TIMESTAMPTZ NOT NULL,
	ends_at         TIMESTAMPTZ NOT NULL,
	max_redemptions INTEGER NOT NULL CHECK (max_redemptions > 0),
	redemptions     INTEGER NOT NULL DEFAULT 0,
	disabled        BOOLEAN NOT NULL DEFAULT FALSE,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promo_organizer ON promo_campaigns (organizer_id);
`

func init() {
	schemas = append(schemas, schemaPromo)
}

func (s *Server) registerPromoRoutes(mux *http.ServeMux) {
	organizerOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("organizer")(h))
	}
	mux.Handle("GET /api/organizer/campaigns", organizerOnly(s.handleListCampaigns))
	mux.Handle("POST /api/organizer/campaigns", organizerOnly(s.handleCreateCampaign))
	mux.Handle("PATCH /api/organizer/campaigns/{id}", organizerOnly(s.handleUpdateCampaign))
	mux.Handle("POST /api/promo/validate", s.requireAuth(http.HandlerFunc(s.handleValidatePromo)))
}

type campaign struct {
	ID             string    `json:"id"`
	EventID        *string   `json:"event_id"`
	EventTitle     string    `json:"event_title"`
	Name           string    `json:"name"`
	Code           string    `json:"code"`
	DiscountType   string    `json:"discount_type"`
	Amount         int       `json:"amount"`
	StartsAt       time.Time `json:"starts_at"`
	EndsAt         time.Time `json:"ends_at"`
	MaxRedemptions int       `json:"max_redemptions"`
	Redemptions    int       `json:"redemptions"`
	Disabled       bool      `json:"disabled"`
	QRURL          string    `json:"qr_url"` // empty: the website draws the QR itself
	CreatedAt      time.Time `json:"created_at"`
	organizerID    string
}

const campaignColumns = `
	c.id, c.event_id, COALESCE(e.title, ''), c.name, c.code, c.discount_type, c.amount, c.starts_at,
	c.ends_at, c.max_redemptions, c.redemptions, c.disabled, c.created_at, c.organizer_id`

const campaignFrom = ` FROM promo_campaigns c LEFT JOIN events e ON e.id = c.event_id`

func scanCampaign(row rowScanner) (campaign, error) {
	var c campaign
	err := row.Scan(&c.ID, &c.EventID, &c.EventTitle, &c.Name, &c.Code, &c.DiscountType, &c.Amount, &c.StartsAt,
		&c.EndsAt, &c.MaxRedemptions, &c.Redemptions, &c.Disabled, &c.CreatedAt, &c.organizerID)
	return c, err
}

// GET /api/organizer/campaigns
func (s *Server) handleListCampaigns(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `SELECT `+campaignColumns+campaignFrom+`
		WHERE c.organizer_id = $1 ORDER BY c.created_at DESC`, claimsFrom(r.Context()).Subject)
	if err != nil {
		internalError(w, "list campaigns", err)
		return
	}
	defer rows.Close()
	list := []campaign{}
	for rows.Next() {
		c, err := scanCampaign(rows)
		if err != nil {
			internalError(w, "list campaigns: scan", err)
			return
		}
		list = append(list, c)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "list campaigns: rows", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

type campaignRequest struct {
	EventID        *string  `json:"event_id"`
	Name           string   `json:"name"`
	DiscountType   string   `json:"discount_type"`
	Amount         int      `json:"amount"`
	StartsAt       flexTime `json:"starts_at"`
	EndsAt         flexTime `json:"ends_at"`
	MaxRedemptions int      `json:"max_redemptions"`
}

var codeChars = []byte("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") // no 0/O or 1/I
var nonCodeChars = regexp.MustCompile(`[^A-Z0-9]`)

// newPromoCode makes a readable code like "STUDENT-7K2Q".
func newPromoCode(name string) (string, error) {
	base := nonCodeChars.ReplaceAllString(strings.ToUpper(name), "")
	if len(base) > 10 {
		base = base[:10]
	}
	if base == "" {
		base = "PROMO"
	}
	tail := make([]byte, 4)
	for i := range tail {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeChars))))
		if err != nil {
			return "", err
		}
		tail[i] = codeChars[n.Int64()]
	}
	return base + "-" + string(tail), nil
}

// POST /api/organizer/campaigns
func (s *Server) handleCreateCampaign(w http.ResponseWriter, r *http.Request) {
	var req campaignRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	switch {
	case req.Name == "" || len(req.Name) > 100:
		writeError(w, http.StatusBadRequest, "name is required (max 100 characters)")
		return
	case req.DiscountType != "percent" && req.DiscountType != "fixed":
		writeError(w, http.StatusBadRequest, "discount_type must be percent or fixed")
		return
	case req.Amount <= 0:
		writeError(w, http.StatusBadRequest, "amount must be greater than 0")
		return
	case req.DiscountType == "percent" && req.Amount > 100:
		writeError(w, http.StatusBadRequest, "a percent discount cannot be more than 100")
		return
	case !req.StartsAt.Set || !req.EndsAt.Set:
		writeError(w, http.StatusBadRequest, "starts_at and ends_at are required")
		return
	case !req.EndsAt.After(req.StartsAt.Time):
		writeError(w, http.StatusBadRequest, "ends_at must be after starts_at")
		return
	case req.EndsAt.Before(time.Now()):
		writeError(w, http.StatusBadRequest, "the campaign would already be over")
		return
	case req.MaxRedemptions <= 0 || req.MaxRedemptions > 100000:
		writeError(w, http.StatusBadRequest, "max_redemptions must be between 1 and 100000")
		return
	}
	ctx := r.Context()
	organizerID := claimsFrom(ctx).Subject
	var eventID any
	if req.EventID != nil && *req.EventID != "" {
		info, err := loadEventInfo(ctx, s.db, *req.EventID, false)
		if err != nil {
			notFoundOr500(w, "create campaign: event", "event", err)
			return
		}
		if info.OrganizerID != organizerID {
			writeError(w, http.StatusForbidden, "you do not own this event")
			return
		}
		if info.Status == "cancelled" {
			writeError(w, http.StatusConflict, "this event is cancelled")
			return
		}
		eventID = info.ID
	}

	for attempt := 0; attempt < 5; attempt++ {
		code, err := newPromoCode(req.Name)
		if err != nil {
			internalError(w, "create campaign: code", err)
			return
		}
		var id string
		err = s.db.QueryRow(ctx, `
			INSERT INTO promo_campaigns (organizer_id, event_id, name, code, discount_type, amount,
			                             starts_at, ends_at, max_redemptions)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
			organizerID, eventID, req.Name, code, req.DiscountType, req.Amount,
			req.StartsAt.Time, req.EndsAt.Time, req.MaxRedemptions).Scan(&id)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			continue // the code already exists; try another
		}
		if err != nil {
			internalError(w, "create campaign: insert", err)
			return
		}
		c, err := scanCampaign(s.db.QueryRow(ctx, `SELECT `+campaignColumns+campaignFrom+` WHERE c.id = $1`, id))
		if err != nil {
			internalError(w, "create campaign: load", err)
			return
		}
		if c.EventID != nil {
			_ = writeAudit(ctx, s.db, auditEntry{ActorID: organizerID, EventID: *c.EventID, Category: "orders",
				Action: "promo.create", TargetID: c.ID,
				Message: fmt.Sprintf("Promo campaign %q created, code %s (%s)", c.Name, c.Code, discountText(c))})
		}
		writeJSON(w, http.StatusCreated, c)
		return
	}
	writeError(w, http.StatusConflict, "could not make a unique code; try again")
}

func discountText(c campaign) string {
	if c.DiscountType == "percent" {
		return fmt.Sprintf("%d%% off", c.Amount)
	}
	return kztText(c.Amount) + " off"
}

type campaignPatch struct {
	Disabled *bool `json:"disabled"`
}

// PATCH /api/organizer/campaigns/{id} { disabled }
func (s *Server) handleUpdateCampaign(w http.ResponseWriter, r *http.Request) {
	var req campaignPatch
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Disabled == nil {
		writeError(w, http.StatusBadRequest, "disabled is required")
		return
	}
	ctx := r.Context()
	id := r.PathValue("id")
	if !isUUID(id) {
		writeError(w, http.StatusNotFound, "campaign not found")
		return
	}
	c, err := scanCampaign(s.db.QueryRow(ctx, `SELECT `+campaignColumns+campaignFrom+` WHERE c.id = $1`, id))
	if err != nil {
		notFoundOr500(w, "update campaign: load", "campaign", err)
		return
	}
	if c.organizerID != claimsFrom(ctx).Subject {
		writeError(w, http.StatusNotFound, "campaign not found")
		return
	}
	if _, err := s.db.Exec(ctx, `UPDATE promo_campaigns SET disabled = $2 WHERE id = $1`, id, *req.Disabled); err != nil {
		internalError(w, "update campaign: update", err)
		return
	}
	c.Disabled = *req.Disabled
	if c.EventID != nil {
		verb := "enabled"
		if c.Disabled {
			verb = "disabled"
		}
		_ = writeAudit(ctx, s.db, auditEntry{ActorID: c.organizerID, EventID: *c.EventID, Category: "orders",
			Action: "promo.update", TargetID: c.ID, Message: fmt.Sprintf("Promo code %s %s", c.Code, verb)})
	}
	writeJSON(w, http.StatusOK, c)
}

// findPromo checks a code for an event at a time. lock=true locks the row for checkout.
// It returns a message for the buyer when the code cannot be used.
func findPromo(ctx context.Context, db dbtx, code string, ev eventInfo, now time.Time, lock bool) (campaign, string, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	q := `SELECT ` + campaignColumns + campaignFrom + ` WHERE c.code = $1`
	if lock {
		q += ` FOR UPDATE OF c`
	}
	c, err := scanCampaign(db.QueryRow(ctx, q, code))
	if errors.Is(err, pgx.ErrNoRows) {
		return c, "this promo code does not exist", nil
	}
	if err != nil {
		return c, "", err
	}
	switch {
	case c.EventID != nil && *c.EventID != ev.ID, c.EventID == nil && c.organizerID != ev.OrganizerID:
		return c, "this promo code is not valid for this event", nil
	case c.Disabled:
		return c, "this promo code is no longer active", nil
	case now.Before(c.StartsAt):
		return c, "this promo code is not active yet", nil
	case now.After(c.EndsAt):
		return c, "this promo code has expired", nil
	case c.Redemptions >= c.MaxRedemptions:
		return c, "this promo code has been used up", nil
	}
	return c, "", nil
}

// discountFor returns the discount on a paid subtotal (never more than the subtotal).
func discountFor(c campaign, subtotal int) int {
	d := c.Amount
	if c.DiscountType == "percent" {
		d = (subtotal*c.Amount + 50) / 100
	}
	if d > subtotal {
		d = subtotal
	}
	return d
}

type validatePromoRequest struct {
	EventID string `json:"event_id"`
	Code    string `json:"code"`
}

// POST /api/promo/validate { event_id, code } -> { code, discount_type, amount }
func (s *Server) handleValidatePromo(w http.ResponseWriter, r *http.Request) {
	var req validatePromoRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Code) == "" {
		writeError(w, http.StatusBadRequest, "enter a promo code")
		return
	}
	ctx := r.Context()
	info, err := loadEventInfo(ctx, s.db, req.EventID, false)
	if err != nil {
		notFoundOr500(w, "validate promo: event", "event", err)
		return
	}
	c, msg, err := findPromo(ctx, s.db, req.Code, info, time.Now(), false)
	if err != nil {
		internalError(w, "validate promo", err)
		return
	}
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"code": c.Code, "discount_type": c.DiscountType, "amount": c.Amount})
}
