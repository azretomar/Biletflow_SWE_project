package main

import (
	"context"
	"fmt"
	"net/http"
	"net/mail"
	"regexp"
	"sort"
	"strings"
	"time"
)

const schemaOrganizer = `
CREATE TABLE IF NOT EXISTS organizer_profiles (
	user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	display_name  TEXT NOT NULL DEFAULT '',
	bio           TEXT NOT NULL DEFAULT '',
	contact_email TEXT NOT NULL DEFAULT '',
	phone         TEXT NOT NULL DEFAULT '',
	website       TEXT NOT NULL DEFAULT '',
	city          TEXT NOT NULL DEFAULT '',
	payout_holder TEXT NOT NULL DEFAULT '',
	payout_bank   TEXT NOT NULL DEFAULT '',
	payout_iban   TEXT NOT NULL DEFAULT '',
	payout_bin    TEXT NOT NULL DEFAULT '',
	updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

func init() {
	schemas = append(schemas, schemaOrganizer)
}

// Organizer-only views and actions on the organizer's own events.
func (s *Server) registerOrganizerRoutes(mux *http.ServeMux) {
	organizerOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("organizer")(h))
	}
	mux.Handle("GET /api/organizer/events", organizerOnly(s.handleOrganizerEvents))
	mux.Handle("POST /api/organizer/events/{id}/cancel", organizerOnly(s.handleCancelEvent))
	mux.Handle("GET /api/organizer/events/{id}/attendees", organizerOnly(s.handleAttendees))
	mux.Handle("GET /api/organizer/events/{id}/activation", organizerOnly(s.handleGetActivation))
	mux.Handle("POST /api/organizer/events/{id}/activation/{step}", organizerOnly(s.handleActivationStep))
	mux.Handle("GET /api/organizer/events/{id}/analytics", organizerOnly(s.handleAnalytics))
	mux.Handle("GET /api/organizer/events/{id}/history", organizerOnly(s.handleHistory))
	mux.Handle("GET /api/organizer/profile", organizerOnly(s.handleGetProfile))
	mux.Handle("PUT /api/organizer/profile", organizerOnly(s.handlePutProfile))
}

type organizerEvent struct {
	Event
	MinPrice    int `json:"min_price"`
	TicketTypes int `json:"ticket_type_count"`
	TotalQty    int `json:"total_quantity"`
	Sold        int `json:"sold"`
}

// GET /api/organizer/events
// Events created by the logged-in organizer (drafts and cancelled ones too), soonest first,
// with how many tickets were issued (sum of quantity - quantity_left over the ticket types).
func (s *Server) handleOrganizerEvents(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	rows, err := s.db.Query(r.Context(), `
		SELECT `+eventColumns+`,
		       COALESCE((SELECT MIN(t.price) FROM ticket_types t WHERE t.event_id = e.id), 0),
		       (SELECT COUNT(*) FROM ticket_types t WHERE t.event_id = e.id),
		       COALESCE((SELECT SUM(t.quantity) FROM ticket_types t WHERE t.event_id = e.id), 0),
		       COALESCE((SELECT SUM(t.quantity - t.quantity_left) FROM ticket_types t WHERE t.event_id = e.id), 0)
		FROM events e
		JOIN users u ON u.id = e.organizer_id
		WHERE e.organizer_id = $1
		ORDER BY e.date ASC`, claims.Subject)
	if err != nil {
		internalError(w, "organizer events", err)
		return
	}
	defer rows.Close()

	list := []organizerEvent{}
	for rows.Next() {
		var it organizerEvent
		if err := scanEvent(rows, &it.Event, &it.MinPrice, &it.TicketTypes, &it.TotalQty, &it.Sold); err != nil {
			internalError(w, "organizer events: scan", err)
			return
		}
		list = append(list, it)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "organizer events: rows", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// POST /api/organizer/events/{id}/cancel { reason }
// Ticket sales stop, every paid order is refunded (simulated) and every free registration
// is cancelled, so no ticket of this event works any more. Attendees get an email.
func (s *Server) handleCancelEvent(w http.ResponseWriter, r *http.Request) {
	reason, ok := readReason(w, r, true)
	if !ok {
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "cancel event: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	info, ok := ownedEventTx(w, r, tx, r.PathValue("id"))
	if !ok {
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE events SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, info.ID); err != nil {
		internalError(w, "cancel event: update", err)
		return
	}
	refunded, cancelled, emails, err := closeAllOrders(ctx, tx, info.ID)
	if err != nil {
		internalError(w, "cancel event: orders", err)
		return
	}
	msg := fmt.Sprintf("Event cancelled. %d paid orders refunded (simulated), %d free registrations cancelled", refunded, cancelled)
	if err := writeAudit(ctx, tx, auditEntry{ActorID: info.OrganizerID, EventID: info.ID, Category: "event",
		Action: "event.cancel", TargetID: info.ID, Reason: reason, Message: msg}); err != nil {
		internalError(w, "cancel event: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "cancel event: commit", err)
		return
	}
	for _, email := range emails {
		sendEmail(email, "Event cancelled: "+info.Title,
			info.Title+" was cancelled by the organizer. Reason: "+reason+
				"\nPaid tickets are refunded in full (simulated). Your tickets no longer work.")
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "cancelled", "refunded_orders": refunded, "cancelled_orders": cancelled})
}

type attendee struct {
	TicketID    string     `json:"ticket_id"`
	OrderID     string     `json:"order_id"`
	FullName    string     `json:"full_name"`
	Email       string     `json:"email"`
	TicketType  string     `json:"ticket_type"`
	Status      string     `json:"status"`
	CheckedInAt *time.Time `json:"checked_in_at"`
}

// GET /api/organizer/events/{id}/attendees
func (s *Server) handleAttendees(w http.ResponseWriter, r *http.Request) {
	ev, ok := s.ownedEvent(w, r, r.PathValue("id"))
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT t.id, t.order_id, u.full_name, u.email, tt.name, t.status, t.checked_in_at
		FROM tickets t
		JOIN users u ON u.id = t.user_id
		JOIN ticket_types tt ON tt.id = t.ticket_type_id
		WHERE t.event_id = $1
		ORDER BY u.full_name, t.created_at, t.id`, ev.ID)
	if err != nil {
		internalError(w, "attendees", err)
		return
	}
	defer rows.Close()
	list := []attendee{}
	for rows.Next() {
		var a attendee
		if err := rows.Scan(&a.TicketID, &a.OrderID, &a.FullName, &a.Email, &a.TicketType, &a.Status, &a.CheckedInAt); err != nil {
			internalError(w, "attendees: scan", err)
			return
		}
		list = append(list, a)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "attendees: rows", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// ---- Paid sales activation (SRS 3.2, 4.5). Everything is simulated. ----

type activationState struct {
	IdentityVerified bool       `json:"identity_verified"`
	PayoutConnected  bool       `json:"payout_connected"`
	FeePaid          bool       `json:"fee_paid"`
	TermsAccepted    bool       `json:"terms_accepted"`
	Activated        bool       `json:"activated"`
	PaidSales        string     `json:"paid_sales"` // none | active | stopped
	FeeKZT           int        `json:"fee_kzt"`
	RequestedAt      *time.Time `json:"requested_at"`
	HasPaidType      bool       `json:"has_paid_ticket_type"`
}

func loadActivation(ctx context.Context, db dbtx, eventID string) (activationState, error) {
	a := activationState{FeeKZT: kzFeeKZT}
	err := db.QueryRow(ctx, `
		SELECT e.identity_verified, e.fee_paid, e.terms_accepted, e.paid_sales, e.activation_requested_at,
		       COALESCE(p.payout_holder <> '' AND p.payout_bank <> '' AND p.payout_iban <> '', FALSE),
		       EXISTS (SELECT 1 FROM ticket_types t WHERE t.event_id = e.id AND t.price > 0)
		FROM events e
		LEFT JOIN organizer_profiles p ON p.user_id = e.organizer_id
		WHERE e.id = $1`, eventID).Scan(&a.IdentityVerified, &a.FeePaid, &a.TermsAccepted, &a.PaidSales,
		&a.RequestedAt, &a.PayoutConnected, &a.HasPaidType)
	a.Activated = a.PaidSales == "active"
	return a, err
}

// GET /api/organizer/events/{id}/activation
func (s *Server) handleGetActivation(w http.ResponseWriter, r *http.Request) {
	ev, ok := s.ownedEvent(w, r, r.PathValue("id"))
	if !ok {
		return
	}
	a, err := loadActivation(r.Context(), s.db, ev.ID)
	if err != nil {
		internalError(w, "activation", err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// POST /api/organizer/events/{id}/activation/{step}
// step: identity | payout | fee | terms (simulated) | activate
func (s *Server) handleActivationStep(w http.ResponseWriter, r *http.Request) {
	step := r.PathValue("step")
	columns := map[string]string{"identity": "identity_verified", "fee": "fee_paid", "terms": "terms_accepted"}
	messages := map[string]string{
		"identity": "Identity verified (simulated)",
		"fee":      "Activation fee paid: " + kztText(kzFeeKZT) + " (simulated)",
		"terms":    "Paid-event terms accepted",
	}
	if _, known := columns[step]; !known && step != "payout" && step != "activate" {
		writeError(w, http.StatusNotFound, "unknown step")
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "activation: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	info, ok := ownedEventTx(w, r, tx, r.PathValue("id"))
	if !ok {
		return
	}
	a, err := loadActivation(ctx, tx, info.ID)
	if err != nil {
		internalError(w, "activation: load", err)
		return
	}

	var msg string
	switch step {
	case "payout":
		if !a.PayoutConnected {
			writeError(w, http.StatusBadRequest, "add your payout account (holder, bank and IBAN) in your organizer profile first")
			return
		}
		msg = "Payout account connected"
	case "activate":
		switch {
		case a.Activated:
			writeJSON(w, http.StatusOK, a)
			return
		case a.PaidSales == "stopped":
			writeError(w, http.StatusConflict, "paid sales for this event were stopped by BiletFlow; contact support")
			return
		case info.Suspended:
			writeError(w, http.StatusConflict, "this event is suspended by BiletFlow; contact support")
			return
		case !a.HasPaidType:
			writeError(w, http.StatusBadRequest, "add a paid ticket type first")
			return
		case !a.IdentityVerified || !a.PayoutConnected || !a.FeePaid || !a.TermsAccepted:
			writeError(w, http.StatusBadRequest, "finish every step of the checklist first")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE events SET paid_sales = 'active' WHERE id = $1`, info.ID); err != nil {
			internalError(w, "activation: activate", err)
			return
		}
		msg = "Paid ticket sales activated"
	default:
		if _, err := tx.Exec(ctx, `UPDATE events SET `+columns[step]+` = TRUE WHERE id = $1`, info.ID); err != nil {
			internalError(w, "activation: step", err)
			return
		}
		msg = messages[step]
	}
	if _, err := tx.Exec(ctx, `UPDATE events SET activation_requested_at = COALESCE(activation_requested_at, now()) WHERE id = $1`,
		info.ID); err != nil {
		internalError(w, "activation: requested", err)
		return
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: info.OrganizerID, EventID: info.ID, Category: "payments",
		Action: "activation." + step, TargetID: info.ID, Message: msg}); err != nil {
		internalError(w, "activation: audit", err)
		return
	}
	if a, err = loadActivation(ctx, tx, info.ID); err != nil {
		internalError(w, "activation: reload", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "activation: commit", err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// ---- Analytics (SRS 4.15) ----

type analyticsResponse struct {
	Event struct {
		Title    string    `json:"title"`
		StartsAt time.Time `json:"starts_at"`
		Venue    string    `json:"venue"`
		Status   string    `json:"status"`
	} `json:"event"`
	Capacity  int `json:"capacity"`
	Sold      int `json:"sold"`
	CheckedIn int `json:"checked_in"`
	Revenue   struct {
		Gross     int `json:"gross"`
		Discounts int `json:"discounts"`
		Refunds   int `json:"refunds"`
		Net       int `json:"net"`
	} `json:"revenue"`
	SalesByDay   []daySales      `json:"sales_by_day"`
	ByTicketType []typeAnalytics `json:"by_ticket_type"`
	Promo        []promoUse      `json:"promo"`
}

type daySales struct {
	Date    string `json:"date"`
	Tickets int    `json:"tickets"`
	Revenue int    `json:"revenue"`
}

type typeAnalytics struct {
	Name     string `json:"name"`
	Price    int    `json:"price"`
	Quantity int    `json:"quantity"`
	Sold     int    `json:"sold"`
	Revenue  int    `json:"revenue"`
}

type promoUse struct {
	Code          string `json:"code"`
	Redemptions   int    `json:"redemptions"`
	DiscountTotal int    `json:"discount_total"`
}

// GET /api/organizer/events/{id}/analytics
// Money: gross = list price of every completed or later refunded order, discounts = promo
// discounts on them, refunds = what was paid back, net = gross - discounts - refunds.
// sales_by_day counts tickets that are still valid (refunded and cancelled ones drop out).
func (s *Server) handleAnalytics(w http.ResponseWriter, r *http.Request) {
	ev, ok := s.ownedEvent(w, r, r.PathValue("id"))
	if !ok {
		return
	}
	ctx := r.Context()
	var a analyticsResponse
	a.SalesByDay, a.ByTicketType, a.Promo = []daySales{}, []typeAnalytics{}, []promoUse{}
	err := s.db.QueryRow(ctx, `
		SELECT e.title, e.date, e.venue, e.status, e.capacity,
		       (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('valid','checked_in')),
		       (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'checked_in'),
		       COALESCE((SELECT SUM(GREATEST(o.subtotal_amount, o.total_amount)) FROM orders o
		                 WHERE o.event_id = e.id AND o.status IN ('completed','refunded')), 0),
		       COALESCE((SELECT SUM(o.discount_amount) FROM orders o
		                 WHERE o.event_id = e.id AND o.status IN ('completed','refunded')), 0),
		       COALESCE((SELECT SUM(o.total_amount) FROM orders o
		                 WHERE o.event_id = e.id AND o.status = 'refunded'), 0)
		FROM events e WHERE e.id = $1`, ev.ID).Scan(&a.Event.Title, &a.Event.StartsAt, &a.Event.Venue, &a.Event.Status,
		&a.Capacity, &a.Sold, &a.CheckedIn, &a.Revenue.Gross, &a.Revenue.Discounts, &a.Revenue.Refunds)
	if err != nil {
		internalError(w, "analytics: totals", err)
		return
	}
	a.Revenue.Net = a.Revenue.Gross - a.Revenue.Discounts - a.Revenue.Refunds

	rows, err := s.db.Query(ctx, `
		SELECT to_char(o.created_at AT TIME ZONE INTERVAL '+05:00', 'YYYY-MM-DD') AS day,
		       COALESCE(SUM((SELECT COUNT(*) FROM tickets t
		                     WHERE t.order_id = o.id AND t.status IN ('valid','checked_in'))), 0)::int,
		       COALESCE(SUM(o.total_amount), 0)::int
		FROM orders o
		WHERE o.event_id = $1 AND o.status = 'completed'
		GROUP BY day ORDER BY day`, ev.ID)
	if err != nil {
		internalError(w, "analytics: days", err)
		return
	}
	for rows.Next() {
		var d daySales
		if err := rows.Scan(&d.Date, &d.Tickets, &d.Revenue); err != nil {
			rows.Close()
			internalError(w, "analytics: days scan", err)
			return
		}
		a.SalesByDay = append(a.SalesByDay, d)
	}
	rows.Close()

	rows, err = s.db.Query(ctx, `
		SELECT tt.name, tt.price, tt.quantity, tt.quantity - tt.quantity_left,
		       COALESCE((SELECT SUM(t.price_paid) FROM tickets t
		                 WHERE t.ticket_type_id = tt.id AND t.status IN ('valid','checked_in')), 0)::int
		FROM ticket_types tt WHERE tt.event_id = $1 ORDER BY tt.price, tt.created_at`, ev.ID)
	if err != nil {
		internalError(w, "analytics: types", err)
		return
	}
	for rows.Next() {
		var t typeAnalytics
		if err := rows.Scan(&t.Name, &t.Price, &t.Quantity, &t.Sold, &t.Revenue); err != nil {
			rows.Close()
			internalError(w, "analytics: types scan", err)
			return
		}
		a.ByTicketType = append(a.ByTicketType, t)
	}
	rows.Close()

	rows, err = s.db.Query(ctx, `
		SELECT pc.code, COUNT(o.id)::int, COALESCE(SUM(o.discount_amount), 0)::int
		FROM orders o JOIN promo_campaigns pc ON pc.id = o.promo_campaign_id
		WHERE o.event_id = $1 AND o.status IN ('completed','refunded')
		GROUP BY pc.code ORDER BY 2 DESC, 1`, ev.ID)
	if err != nil {
		internalError(w, "analytics: promo", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var p promoUse
		if err := rows.Scan(&p.Code, &p.Redemptions, &p.DiscountTotal); err != nil {
			internalError(w, "analytics: promo scan", err)
			return
		}
		a.Promo = append(a.Promo, p)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "analytics: rows", err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// ---- History (SRS 4.16) ----

type activity struct {
	ID      string    `json:"id"`
	At      time.Time `json:"at"`
	Actor   string    `json:"actor"`
	Type    string    `json:"type"` // event | tickets | orders | checkin | payments
	Message string    `json:"message"`
	Reason  string    `json:"reason,omitempty"`
}

type historyEvent struct {
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Venue       string    `json:"venue"`
	Capacity    int       `json:"capacity"`
	Date        time.Time `json:"date"`
	ImageURL    string    `json:"image_url"`
}

const maxHistory = 500

// GET /api/organizer/events/{id}/history
// Combines the audit log of the event with orders and check-ins, newest first.
func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	ev, ok := s.ownedEvent(w, r, r.PathValue("id"))
	if !ok {
		return
	}
	ctx := r.Context()
	var h historyEvent
	if err := s.db.QueryRow(ctx, `SELECT title, description, category, venue, capacity, date, image_url
		FROM events WHERE id = $1`, ev.ID).Scan(&h.Title, &h.Description, &h.Category, &h.Venue, &h.Capacity,
		&h.Date, &h.ImageURL); err != nil {
		internalError(w, "history: event", err)
		return
	}
	rows, err := s.db.Query(ctx, `
		(SELECT 'a' || a.id, a.at, COALESCE(u.full_name, 'BiletFlow'),
		        CASE WHEN a.category = 'admin' THEN 'event' ELSE a.category END,
		        CASE WHEN a.category = 'admin' THEN 'BiletFlow admin: ' || a.message ELSE a.message END,
		        a.reason
		 FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
		 WHERE a.event_id = $1
		 ORDER BY a.at DESC LIMIT $2)
		UNION ALL
		(SELECT 'o' || o.id, o.created_at, u.full_name, 'orders',
		        CASE WHEN o.status = 'failed'
		             THEN 'Payment failed, no tickets issued (order ' || o.id || ')'
		             ELSE 'Order ' || o.id || ': ' ||
		                  (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id) || ' ticket(s), ' ||
		                  CASE WHEN GREATEST(o.subtotal_amount, o.total_amount) = 0 THEN 'free'
		                       ELSE to_char(o.total_amount, 'FM999,999,999,990') || ' ₸' END
		        END, ''
		 FROM orders o JOIN users u ON u.id = o.user_id
		 WHERE o.event_id = $1
		 ORDER BY o.created_at DESC LIMIT $2)
		UNION ALL
		(SELECT 'c' || t.id, t.checked_in_at, COALESCE(s.full_name, ''), 'checkin',
		        'Checked in: ' || u.full_name || ' (' || tt.name || ')', ''
		 FROM tickets t
		 JOIN users u ON u.id = t.user_id
		 JOIN ticket_types tt ON tt.id = t.ticket_type_id
		 LEFT JOIN users s ON s.id = t.checked_in_by
		 WHERE t.event_id = $1 AND t.checked_in_at IS NOT NULL
		 ORDER BY t.checked_in_at DESC LIMIT $2)`, ev.ID, maxHistory)
	if err != nil {
		internalError(w, "history: activity", err)
		return
	}
	defer rows.Close()
	list := []activity{}
	for rows.Next() {
		var a activity
		if err := rows.Scan(&a.ID, &a.At, &a.Actor, &a.Type, &a.Message, &a.Reason); err != nil {
			internalError(w, "history: scan", err)
			return
		}
		if a.Reason != "" {
			a.Message += ". Reason: " + a.Reason
		}
		list = append(list, a)
	}
	if err := rows.Err(); err != nil {
		internalError(w, "history: rows", err)
		return
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].At.After(list[j].At) })
	if len(list) > maxHistory {
		list = list[:maxHistory]
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": h, "activity": list})
}

// ---- Organizer profile (SRS 4.1) ----

type payoutDetails struct {
	HolderName string `json:"holder_name"`
	BankName   string `json:"bank_name"`
	IBAN       string `json:"iban"`
	BinIIN     string `json:"bin_iin"`
}

type organizerProfile struct {
	DisplayName  string        `json:"display_name"`
	Bio          string        `json:"bio"`
	ContactEmail string        `json:"contact_email"`
	Phone        string        `json:"phone"`
	Website      string        `json:"website"`
	City         string        `json:"city"`
	Payout       payoutDetails `json:"payout"`
}

// GET /api/organizer/profile - defaults to the account name and email until saved.
func (s *Server) handleGetProfile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var p organizerProfile
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(NULLIF(p.display_name, ''), u.full_name), COALESCE(p.bio, ''),
		       COALESCE(NULLIF(p.contact_email, ''), u.email), COALESCE(p.phone, ''), COALESCE(p.website, ''),
		       COALESCE(p.city, ''), COALESCE(p.payout_holder, ''), COALESCE(p.payout_bank, ''),
		       COALESCE(p.payout_iban, ''), COALESCE(p.payout_bin, '')
		FROM users u LEFT JOIN organizer_profiles p ON p.user_id = u.id
		WHERE u.id = $1`, claimsFrom(ctx).Subject).Scan(&p.DisplayName, &p.Bio, &p.ContactEmail, &p.Phone,
		&p.Website, &p.City, &p.Payout.HolderName, &p.Payout.BankName, &p.Payout.IBAN, &p.Payout.BinIIN)
	if err != nil {
		notFoundOr500(w, "profile", "user", err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

var (
	kzIBAN    = regexp.MustCompile(`^KZ\d{2}[A-Z0-9]{16}$`)
	binIIN    = regexp.MustCompile(`^\d{12}$`)
	phoneText = regexp.MustCompile(`^[0-9+()\- ]{5,30}$`)
)

// PUT /api/organizer/profile
func (s *Server) handlePutProfile(w http.ResponseWriter, r *http.Request) {
	var p organizerProfile
	if !decodeJSON(w, r, &p) {
		return
	}
	trim := strings.TrimSpace
	p.DisplayName, p.Bio, p.ContactEmail = trim(p.DisplayName), trim(p.Bio), strings.ToLower(trim(p.ContactEmail))
	p.Phone, p.Website, p.City = trim(p.Phone), trim(p.Website), trim(p.City)
	p.Payout.HolderName, p.Payout.BankName = trim(p.Payout.HolderName), trim(p.Payout.BankName)
	p.Payout.IBAN = strings.ToUpper(strings.ReplaceAll(p.Payout.IBAN, " ", ""))
	p.Payout.BinIIN = trim(p.Payout.BinIIN)

	problem := ""
	switch {
	case p.DisplayName == "" || len(p.DisplayName) > 100:
		problem = "display_name is required (max 100 characters)"
	case len(p.Bio) > 2000:
		problem = "bio is too long (max 2000 characters)"
	case p.ContactEmail != "" && func() bool { _, err := mail.ParseAddress(p.ContactEmail); return err != nil }():
		problem = "contact_email is not a valid email address"
	case p.Phone != "" && !phoneText.MatchString(p.Phone):
		problem = "phone may contain only digits, spaces, +, - and brackets"
	case p.Website != "" && !strings.HasPrefix(p.Website, "https://") && !strings.HasPrefix(p.Website, "http://"):
		problem = "website must start with https://"
	case len(p.Website) > 300 || len(p.City) > 100:
		problem = "website or city is too long"
	case len(p.Payout.HolderName) > 100 || len(p.Payout.BankName) > 100:
		problem = "payout holder or bank name is too long"
	case p.Payout.IBAN != "" && !kzIBAN.MatchString(p.Payout.IBAN):
		problem = "a Kazakhstan IBAN has 20 characters and starts with KZ"
	case p.Payout.BinIIN != "" && !binIIN.MatchString(p.Payout.BinIIN):
		problem = "BIN / IIN has exactly 12 digits"
	}
	if problem != "" {
		writeError(w, http.StatusBadRequest, problem)
		return
	}
	ctx := r.Context()
	userID := claimsFrom(ctx).Subject
	_, err := s.db.Exec(ctx, `
		INSERT INTO organizer_profiles (user_id, display_name, bio, contact_email, phone, website, city,
		                                payout_holder, payout_bank, payout_iban, payout_bin, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
		ON CONFLICT (user_id) DO UPDATE SET
			display_name = EXCLUDED.display_name, bio = EXCLUDED.bio, contact_email = EXCLUDED.contact_email,
			phone = EXCLUDED.phone, website = EXCLUDED.website, city = EXCLUDED.city,
			payout_holder = EXCLUDED.payout_holder, payout_bank = EXCLUDED.payout_bank,
			payout_iban = EXCLUDED.payout_iban, payout_bin = EXCLUDED.payout_bin, updated_at = now()`,
		userID, p.DisplayName, p.Bio, p.ContactEmail, p.Phone, p.Website, p.City,
		p.Payout.HolderName, p.Payout.BankName, p.Payout.IBAN, p.Payout.BinIIN)
	if err != nil {
		internalError(w, "profile: save", err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}
