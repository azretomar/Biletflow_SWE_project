package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Orders, simulated payments and refunds (SRS 4.6, 4.9). No real money moves:
// the buyer chooses whether the test payment succeeds.
const schemaOrders = `
CREATE TABLE IF NOT EXISTS order_items (
	order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
	ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
	name           TEXT NOT NULL,     -- ticket type name at purchase time
	price          INTEGER NOT NULL,  -- KZT per ticket at purchase time
	quantity       INTEGER NOT NULL CHECK (quantity > 0),
	PRIMARY KEY (order_id, ticket_type_id)
);
`

func init() {
	alterSchemas = append(alterSchemas, schemaOrders) // needs orders and ticket_types first
}

func (s *Server) registerOrderRoutes(mux *http.ServeMux) {
	organizerOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("organizer")(h))
	}
	mux.Handle("POST /api/orders/checkout", s.requireAuth(http.HandlerFunc(s.handleCheckout)))
	mux.Handle("GET /api/my-orders", s.requireAuth(http.HandlerFunc(s.handleMyOrders)))
	mux.Handle("GET /api/organizer/events/{id}/orders", organizerOnly(s.handleEventOrders))
	mux.Handle("GET /api/organizer/events/{id}/refund-policy", organizerOnly(s.handleGetRefundPolicy))
	mux.Handle("PUT /api/organizer/events/{id}/refund-policy", organizerOnly(s.handlePutRefundPolicy))
	mux.Handle("POST /api/organizer/orders/{orderId}/cancel", organizerOnly(s.handleCancelOrder))
	mux.Handle("POST /api/organizer/orders/{orderId}/refund", organizerOnly(s.handleRefundOrder))
}

type checkoutItem struct {
	TicketTypeID string `json:"ticket_type_id"`
	Quantity     int    `json:"quantity"`
}

type checkoutRequest struct {
	EventID   string         `json:"event_id"`
	Items     []checkoutItem `json:"items"`
	PromoCode string         `json:"promo_code"`
	Simulate  string         `json:"simulate"` // "success" (default) or "failure"
}

type checkoutResponse struct {
	OrderID  string        `json:"order_id"`
	Status   string        `json:"status"` // paid | free | failed
	Subtotal int           `json:"subtotal"`
	Discount int           `json:"discount"`
	Total    int           `json:"total"`
	Tickets  []ticketBrief `json:"tickets"`
}

type lockedType struct {
	ID    string
	Name  string
	Price int
	Left  int
	Qty   int
}

// POST /api/orders/checkout
// Prices, discounts and stock are all decided here, in one transaction.
func (s *Server) handleCheckout(w http.ResponseWriter, r *http.Request) {
	var req checkoutRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Simulate == "" {
		req.Simulate = "success"
	}
	if req.Simulate != "success" && req.Simulate != "failure" {
		writeError(w, http.StatusBadRequest, "simulate must be success or failure")
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "choose at least one ticket")
		return
	}
	wanted := map[string]int{}
	var order []string
	totalQty := 0
	for _, it := range req.Items {
		if !isUUID(it.TicketTypeID) {
			writeError(w, http.StatusBadRequest, "ticket_type_id is required")
			return
		}
		if it.Quantity < 1 {
			writeError(w, http.StatusBadRequest, "quantity must be at least 1")
			return
		}
		if _, seen := wanted[it.TicketTypeID]; !seen {
			order = append(order, it.TicketTypeID)
		}
		wanted[it.TicketTypeID] += it.Quantity
		totalQty += it.Quantity
	}
	if totalQty > maxTicketsPerOrder {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("you can buy at most %d tickets in one order", maxTicketsPerOrder))
		return
	}

	ctx := r.Context()
	claims := claimsFrom(ctx)
	ev, err := s.loadEvent(ctx, req.EventID)
	if err != nil {
		notFoundOr500(w, "checkout: event", "event", err)
		return
	}
	if !s.canSeeEvent(ctx, ev, claims) {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	now := time.Now()
	if msg := registrationBlocked(ev, now); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "checkout: begin", err)
		return
	}
	defer tx.Rollback(context.Background())

	// Lock the event row too, so an admin stop or a cancellation cannot slip in between.
	info, err := loadEventInfo(ctx, tx, ev.ID, true)
	if err != nil {
		internalError(w, "checkout: lock event", err)
		return
	}
	if info.Status != "published" || info.Suspended {
		writeError(w, http.StatusBadRequest, "ticket sales for this event are closed")
		return
	}

	types := make([]lockedType, 0, len(order))
	subtotal := 0
	for _, id := range order {
		t := lockedType{ID: id, Qty: wanted[id]}
		var rules TicketType // the sale rules of this type
		err := tx.QueryRow(ctx, `
			SELECT name, price, quantity_left, sales_starts_at, sales_ends_at, max_per_order, hidden
			FROM ticket_types
			WHERE id = $1 AND event_id = $2 FOR UPDATE`, id, ev.ID).Scan(&t.Name, &t.Price, &t.Left,
			&rules.SalesStartsAt, &rules.SalesEndsAt, &rules.MaxPerOrder, &rules.Hidden)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "ticket type not found for this event")
			return
		}
		if err != nil {
			internalError(w, "checkout: lock type", err)
			return
		}
		rules.Name = t.Name
		if status, msg := saleBlocked(rules, t.Qty, now); status != 0 {
			writeError(w, status, msg)
			return
		}
		if t.Left < t.Qty {
			writeError(w, http.StatusConflict, fmt.Sprintf("not enough %q tickets left (%d remaining)", t.Name, t.Left))
			return
		}
		subtotal += t.Price * t.Qty
		types = append(types, t)
	}
	if subtotal > 0 && info.PaidSales != "active" {
		if info.PaidSales == "stopped" {
			writeError(w, http.StatusBadRequest, "paid ticket sales for this event are paused by BiletFlow")
		} else {
			writeError(w, http.StatusBadRequest, "paid ticket sales are not activated for this event yet")
		}
		return
	}

	discount := 0
	var promo *campaign
	if strings.TrimSpace(req.PromoCode) != "" {
		c, msg, err := findPromo(ctx, tx, req.PromoCode, info, now, true)
		if err != nil {
			internalError(w, "checkout: promo", err)
			return
		}
		if msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
		promo = &c
		discount = discountFor(c, subtotal)
	}
	total := subtotal - discount

	var promoID any
	if promo != nil {
		promoID = promo.ID
	}
	failed := req.Simulate == "failure" && total > 0
	status := "completed"
	if failed {
		status = "failed"
	}
	var orderID string
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (user_id, event_id, total_amount, subtotal_amount, discount_amount, promo_campaign_id, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		claims.Subject, ev.ID, total, subtotal, discount, promoID, status).Scan(&orderID)
	if err != nil {
		internalError(w, "checkout: order", err)
		return
	}
	for _, t := range types {
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_items (order_id, ticket_type_id, name, price, quantity) VALUES ($1, $2, $3, $4, $5)`,
			orderID, t.ID, t.Name, t.Price, t.Qty); err != nil {
			internalError(w, "checkout: item", err)
			return
		}
	}

	resp := checkoutResponse{OrderID: orderID, Subtotal: subtotal, Discount: discount, Total: total, Tickets: []ticketBrief{}}
	if failed {
		if err := tx.Commit(ctx); err != nil {
			internalError(w, "checkout: commit failed order", err)
			return
		}
		resp.Status = "failed"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	for _, t := range types {
		tag, err := tx.Exec(ctx, `
			UPDATE ticket_types SET quantity_left = quantity_left - $1 WHERE id = $2 AND quantity_left >= $1`, t.Qty, t.ID)
		if err != nil {
			internalError(w, "checkout: decrement", err)
			return
		}
		if tag.RowsAffected() != 1 {
			writeError(w, http.StatusConflict, "not enough tickets left")
			return
		}
		for i := 0; i < t.Qty; i++ {
			qr, err := newQRCode()
			if err != nil {
				internalError(w, "checkout: qr", err)
				return
			}
			tk := ticketBrief{QRCode: qr}
			if err := tx.QueryRow(ctx, `
				INSERT INTO tickets (order_id, event_id, ticket_type_id, user_id, qr_code, price_paid)
				VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status`,
				orderID, ev.ID, t.ID, claims.Subject, qr, t.Price).Scan(&tk.ID, &tk.Status); err != nil {
				internalError(w, "checkout: ticket", err)
				return
			}
			resp.Tickets = append(resp.Tickets, tk)
		}
	}
	if promo != nil {
		if _, err := tx.Exec(ctx, `UPDATE promo_campaigns SET redemptions = redemptions + 1 WHERE id = $1`, promo.ID); err != nil {
			internalError(w, "checkout: redeem", err)
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "checkout: commit", err)
		return
	}
	resp.Status = "paid"
	if subtotal == 0 {
		resp.Status = "free"
	}
	s.sendOrderConfirmation(ctx, claims.Subject, ev, orderID, resp.Tickets)
	writeJSON(w, http.StatusCreated, resp)
}

// ---- Reading orders ----

type orderEvent struct {
	ID    string    `json:"id"`
	Title string    `json:"title"`
	Date  time.Time `json:"date"`
}

type orderItem struct {
	TicketType string `json:"ticket_type"`
	Quantity   int    `json:"quantity"`
	Price      int    `json:"price"`
}

type orderTicket struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type orderAttendee struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
}

type orderView struct {
	ID        string         `json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	Status    string         `json:"status"` // paid | free | failed | cancelled | refunded
	Subtotal  int            `json:"subtotal"`
	Discount  int            `json:"discount"`
	Total     int            `json:"total"`
	PromoCode string         `json:"promo_code"`
	Event     orderEvent     `json:"event"`
	Items     []orderItem    `json:"items"`
	Tickets   []orderTicket  `json:"tickets"`
	Attendee  *orderAttendee `json:"attendee,omitempty"`
}

// publicOrderStatus turns the stored status into what people see.
func publicOrderStatus(stored string, subtotal, total int) string {
	if stored == "completed" || stored == "pending" {
		if subtotal > 0 || total > 0 {
			return "paid"
		}
		return "free"
	}
	return stored
}

// loadOrders reads orders matching where (with args) and fills items and tickets.
func (s *Server) loadOrders(ctx context.Context, where string, withAttendee bool, args ...any) ([]orderView, error) {
	rows, err := s.db.Query(ctx, `
		SELECT o.id, o.created_at, o.status, GREATEST(o.subtotal_amount, o.total_amount), o.discount_amount,
		       o.total_amount, COALESCE(pc.code, ''), e.id, e.title, e.date, u.full_name, u.email
		FROM orders o
		JOIN events e ON e.id = o.event_id
		JOIN users u  ON u.id = o.user_id
		LEFT JOIN promo_campaigns pc ON pc.id = o.promo_campaign_id
		WHERE `+where+`
		ORDER BY o.created_at DESC, o.id`, args...)
	if err != nil {
		return nil, err
	}
	list := []orderView{}
	index := map[string]int{}
	var ids []string
	for rows.Next() {
		var o orderView
		var stored string
		var a orderAttendee
		if err := rows.Scan(&o.ID, &o.CreatedAt, &stored, &o.Subtotal, &o.Discount, &o.Total, &o.PromoCode,
			&o.Event.ID, &o.Event.Title, &o.Event.Date, &a.FullName, &a.Email); err != nil {
			rows.Close()
			return nil, err
		}
		o.Status = publicOrderStatus(stored, o.Subtotal, o.Total)
		o.Items = []orderItem{}
		o.Tickets = []orderTicket{}
		if withAttendee {
			o.Attendee = &a
		}
		index[o.ID] = len(list)
		ids = append(ids, o.ID)
		list = append(list, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return list, nil
	}

	// Items: from order_items, or worked out from the tickets for orders made by free registration.
	irows, err := s.db.Query(ctx, `
		SELECT order_id, name, price, quantity FROM order_items WHERE order_id = ANY($1)
		UNION ALL
		SELECT t.order_id, tt.name, t.price_paid, COUNT(*)::int
		FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id
		WHERE t.order_id = ANY($1)
		  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = t.order_id)
		GROUP BY t.order_id, tt.name, t.price_paid
		ORDER BY 1, 3 DESC, 2`, ids)
	if err != nil {
		return nil, err
	}
	for irows.Next() {
		var orderID string
		var it orderItem
		if err := irows.Scan(&orderID, &it.TicketType, &it.Price, &it.Quantity); err != nil {
			irows.Close()
			return nil, err
		}
		o := &list[index[orderID]]
		o.Items = append(o.Items, it)
	}
	irows.Close()
	if err := irows.Err(); err != nil {
		return nil, err
	}

	trows, err := s.db.Query(ctx, `SELECT order_id, id, status FROM tickets WHERE order_id = ANY($1) ORDER BY created_at, id`, ids)
	if err != nil {
		return nil, err
	}
	defer trows.Close()
	for trows.Next() {
		var orderID string
		var t orderTicket
		if err := trows.Scan(&orderID, &t.ID, &t.Status); err != nil {
			return nil, err
		}
		o := &list[index[orderID]]
		o.Tickets = append(o.Tickets, t)
	}
	if err := trows.Err(); err != nil {
		return nil, err
	}
	for i := range list {
		// Old free orders stored no subtotal: show the item total.
		if list[i].Subtotal == 0 {
			for _, it := range list[i].Items {
				list[i].Subtotal += it.Price * it.Quantity
			}
		}
	}
	return list, nil
}

// GET /api/my-orders
func (s *Server) handleMyOrders(w http.ResponseWriter, r *http.Request) {
	list, err := s.loadOrders(r.Context(), "o.user_id = $1", false, claimsFrom(r.Context()).Subject)
	if err != nil {
		internalError(w, "my orders", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/organizer/events/{id}/orders
func (s *Server) handleEventOrders(w http.ResponseWriter, r *http.Request) {
	ev, ok := s.ownedEvent(w, r, r.PathValue("id"))
	if !ok {
		return
	}
	list, err := s.loadOrders(r.Context(), "o.event_id = $1", true, ev.ID)
	if err != nil {
		internalError(w, "event orders", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

type refundPolicy struct {
	Policy string `json:"policy"`
}

// GET /api/organizer/events/{id}/refund-policy
func (s *Server) handleGetRefundPolicy(w http.ResponseWriter, r *http.Request) {
	ev, ok := s.ownedEvent(w, r, r.PathValue("id"))
	if !ok {
		return
	}
	var p refundPolicy
	if err := s.db.QueryRow(r.Context(), `SELECT refund_policy FROM events WHERE id = $1`, ev.ID).Scan(&p.Policy); err != nil {
		internalError(w, "refund policy", err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// PUT /api/organizer/events/{id}/refund-policy { policy }
func (s *Server) handlePutRefundPolicy(w http.ResponseWriter, r *http.Request) {
	var p refundPolicy
	if !decodeJSON(w, r, &p) {
		return
	}
	p.Policy = strings.TrimSpace(p.Policy)
	if len(p.Policy) > 2000 {
		writeError(w, http.StatusBadRequest, "policy is too long (max 2000 characters)")
		return
	}
	ev, ok := s.ownedEvent(w, r, r.PathValue("id"))
	if !ok {
		return
	}
	ctx := r.Context()
	if _, err := s.db.Exec(ctx, `UPDATE events SET refund_policy = $2 WHERE id = $1`, ev.ID, p.Policy); err != nil {
		internalError(w, "refund policy: update", err)
		return
	}
	_ = writeAudit(ctx, s.db, auditEntry{ActorID: ev.OrganizerID, EventID: ev.ID, Category: "orders",
		Action: "event.refund_policy", TargetID: ev.ID, Message: "Refund policy updated"})
	writeJSON(w, http.StatusOK, p)
}

// closeOrder cancels (free) or refunds (paid) one completed order inside tx: its unused
// tickets become invalid and go back on sale. It returns a message for the caller when the
// order cannot be closed this way. allowUsed lets it close orders whose tickets were already
// scanned at the door (only when the whole event is cancelled).
func closeOrder(ctx context.Context, tx pgx.Tx, orderID, newStatus string, allowUsed bool) (string, error) {
	var stored string
	var subtotal, total int
	err := tx.QueryRow(ctx, `SELECT status, GREATEST(subtotal_amount, total_amount), total_amount
		FROM orders WHERE id = $1 FOR UPDATE`, orderID).Scan(&stored, &subtotal, &total)
	if err != nil {
		return "", err
	}
	if stored != "completed" {
		return "this order is already " + stored, nil
	}
	paid := subtotal > 0 || total > 0
	if newStatus == "cancelled" && paid {
		return "this is a paid order; refund it instead", nil
	}
	if newStatus == "refunded" && !paid {
		return "this is a free registration; cancel it instead", nil
	}
	if !allowUsed {
		var used bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tickets WHERE order_id = $1 AND status = 'checked_in')`,
			orderID).Scan(&used); err != nil {
			return "", err
		}
		if used {
			return "a ticket in this order was already used at the door, so the order cannot be " + newStatus, nil
		}
	}
	ticketStatus := newStatus // cancelled | refunded
	rows, err := tx.Query(ctx, `
		UPDATE tickets SET status = $2 WHERE order_id = $1 AND status = 'valid'
		RETURNING ticket_type_id`, orderID, ticketStatus)
	if err != nil {
		return "", err
	}
	back := map[string]int{}
	for rows.Next() {
		var typeID string
		if err := rows.Scan(&typeID); err != nil {
			rows.Close()
			return "", err
		}
		back[typeID]++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return "", err
	}
	for typeID, n := range back {
		if _, err := tx.Exec(ctx, `UPDATE ticket_types SET quantity_left = LEAST(quantity, quantity_left + $2) WHERE id = $1`,
			typeID, n); err != nil {
			return "", err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE orders SET status = $2, closed_at = now() WHERE id = $1`, orderID, newStatus)
	return "", err
}

// orderForOrganizer loads an order of one of the caller's events.
func orderForOrganizer(ctx context.Context, db dbtx, orderID, organizerID string) (eventID, buyerEmail string, total int, err error) {
	if !isUUID(orderID) {
		return "", "", 0, pgx.ErrNoRows
	}
	var owner string
	err = db.QueryRow(ctx, `
		SELECT o.event_id, e.organizer_id, u.email, o.total_amount
		FROM orders o JOIN events e ON e.id = o.event_id JOIN users u ON u.id = o.user_id
		WHERE o.id = $1`, orderID).Scan(&eventID, &owner, &buyerEmail, &total)
	if err == nil && owner != organizerID {
		err = pgx.ErrNoRows // not theirs: answer as if it did not exist
	}
	return
}

func (s *Server) organizerCloseOrder(w http.ResponseWriter, r *http.Request, newStatus string) {
	orderID := r.PathValue("orderId")
	reason, ok := readReason(w, r, true)
	if !ok {
		return
	}
	ctx := r.Context()
	organizerID := claimsFrom(ctx).Subject
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "close order: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	eventID, email, total, err := orderForOrganizer(ctx, tx, orderID, organizerID)
	if err != nil {
		notFoundOr500(w, "close order: load", "order", err)
		return
	}
	msg, err := closeOrder(ctx, tx, orderID, newStatus, false)
	if err != nil {
		internalError(w, "close order", err)
		return
	}
	if msg != "" {
		writeError(w, http.StatusConflict, msg)
		return
	}
	text := "Free registration " + orderID + " cancelled"
	if newStatus == "refunded" {
		text = "Order " + orderID + " refunded in full: " + kztText(total) + " (simulated)"
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: organizerID, EventID: eventID, Category: "orders",
		Action: map[string]string{"cancelled": "order.cancel", "refunded": "order.refund"}[newStatus], TargetID: orderID, Reason: reason, Message: text}); err != nil {
		internalError(w, "close order: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "close order: commit", err)
		return
	}
	sendEmail(email, "Your BiletFlow order changed", text+". Reason: "+reason)
	writeJSON(w, http.StatusOK, map[string]string{"id": orderID, "status": newStatus})
}

// POST /api/organizer/orders/{orderId}/cancel { reason } - free registrations
func (s *Server) handleCancelOrder(w http.ResponseWriter, r *http.Request) {
	s.organizerCloseOrder(w, r, "cancelled")
}

// POST /api/organizer/orders/{orderId}/refund { reason } - paid orders, full refund (simulated)
func (s *Server) handleRefundOrder(w http.ResponseWriter, r *http.Request) {
	s.organizerCloseOrder(w, r, "refunded")
}

// closeAllOrders cancels or refunds every completed order of an event (when the event is cancelled).
func closeAllOrders(ctx context.Context, tx pgx.Tx, eventID string) (refunded, cancelled int, emails []string, err error) {
	rows, err := tx.Query(ctx, `
		SELECT o.id, GREATEST(o.subtotal_amount, o.total_amount) > 0, u.email
		FROM orders o JOIN users u ON u.id = o.user_id
		WHERE o.event_id = $1 AND o.status = 'completed'`, eventID)
	if err != nil {
		return 0, 0, nil, err
	}
	type ord struct {
		id    string
		paid  bool
		email string
	}
	var list []ord
	for rows.Next() {
		var o ord
		if err := rows.Scan(&o.id, &o.paid, &o.email); err != nil {
			rows.Close()
			return 0, 0, nil, err
		}
		list = append(list, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, nil, err
	}
	seen := map[string]bool{}
	for _, o := range list {
		status := "cancelled"
		if o.paid {
			status = "refunded"
		}
		msg, err := closeOrder(ctx, tx, o.id, status, true)
		if err != nil {
			return 0, 0, nil, err
		}
		if msg != "" {
			log.Printf("cancel event: order %s: %s", o.id, msg)
			continue
		}
		if o.paid {
			refunded++
		} else {
			cancelled++
		}
		if !seen[o.email] {
			seen[o.email] = true
			emails = append(emails, o.email)
		}
	}
	return refunded, cancelled, emails, nil
}
