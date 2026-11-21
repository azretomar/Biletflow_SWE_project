package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// End-to-end flows through the real router and a real database.
// Run with TEST_DATABASE_URL set (skipped otherwise).

type apiClient struct {
	t   *testing.T
	srv *httptest.Server
}

// call sends a request and decodes the JSON answer into a generic value.
func (c apiClient) call(token, method, path string, body any) (int, any) {
	c.t.Helper()
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			c.t.Fatal(err)
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.srv.URL+path, rd)
	if err != nil {
		c.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var out any
	raw, _ := io.ReadAll(res.Body)
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			c.t.Fatalf("%s %s: not JSON (%d): %s", method, path, res.StatusCode, raw)
		}
	}
	return res.StatusCode, out
}

// must expects one status and returns the body as a map (or nil for lists).
func (c apiClient) must(want int, token, method, path string, body any) map[string]any {
	c.t.Helper()
	code, out := c.call(token, method, path, body)
	if code != want {
		c.t.Fatalf("%s %s: status %d, want %d; body %v", method, path, code, want, out)
	}
	m, _ := out.(map[string]any)
	return m
}

func (c apiClient) list(token, path string) []any {
	c.t.Helper()
	code, out := c.call(token, "GET", path, nil)
	if code != 200 {
		c.t.Fatalf("GET %s: status %d; body %v", path, code, out)
	}
	l, ok := out.([]any)
	if !ok {
		c.t.Fatalf("GET %s: not a list: %v", path, out)
	}
	return l
}

func (c apiClient) errMsg(want int, token, method, path string, body any) string {
	c.t.Helper()
	m := c.must(want, token, method, path, body)
	msg, _ := m["error"].(string)
	return msg
}

func num(v any) int {
	f, _ := v.(float64)
	return int(f)
}

func TestFullFlowsDB(t *testing.T) {
	s := newDBTestServer(t)
	srv := httptest.NewServer(s.routes())
	defer srv.Close()
	c := apiClient{t: t, srv: srv}
	ctx := context.Background()
	stamp := time.Now().UnixNano()
	mail := func(n string) string { return strings.ToLower(fmt.Sprintf("%s-%d@test.biletflow.local", n, stamp)) }

	signup := func(name, role string) (string, string) {
		m := c.must(201, "", "POST", "/api/auth/signup", map[string]any{
			"email": mail(name), "password": "password123", "full_name": name, "role": role})
		return m["token"].(string), m["user"].(map[string]any)["id"].(string)
	}
	orgTok, _ := signup("Org", "organizer")
	org2Tok, _ := signup("OtherOrg", "organizer")
	annaTok, annaID := signup("Anna", "attendee")
	benTok, _ := signup("Ben", "attendee")
	adminTok, adminID := signup("Admin", "attendee")
	if _, err := s.db.Exec(ctx, `UPDATE users SET role = 'platform_admin' WHERE id = $1`, adminID); err != nil {
		t.Fatal(err)
	}
	adminTok = c.must(200, "", "POST", "/api/auth/login", map[string]any{"email": mail("Admin"), "password": "password123"})["token"].(string)

	future := time.Now().Add(10 * 24 * time.Hour).In(kzZone).Format("2006-01-02T15:04")

	// ---- Events: create, visibility, edit ----
	ev := c.must(201, orgTok, "POST", "/api/events", map[string]any{
		"title": "Jazz Night", "description": "Live", "date": future, "venue": "NU Hall",
		"capacity": 100, "category": "music"})
	evID := ev["id"].(string)
	if ev["status"] != "published" || ev["visibility"] != "public" || ev["paid_sales"] != "none" {
		t.Fatalf("new event defaults: %v", ev)
	}
	draft := c.must(201, orgTok, "POST", "/api/events", map[string]any{
		"title": "Secret Draft", "date": future, "venue": "X", "capacity": 10, "status": "draft", "visibility": "private"})
	draftID := draft["id"].(string)
	unlisted := c.must(201, orgTok, "POST", "/api/events", map[string]any{
		"title": "Unlisted Party", "date": future, "venue": "Y", "capacity": 10, "visibility": "unlisted"})

	c.errMsg(400, orgTok, "POST", "/api/events", map[string]any{"title": "Bad", "date": future, "venue": "V", "capacity": 5, "category": "cooking"})
	c.errMsg(400, orgTok, "POST", "/api/events", map[string]any{"title": "Old", "date": "2020-01-01T10:00", "venue": "V", "capacity": 5})
	c.errMsg(403, annaTok, "POST", "/api/events", map[string]any{"title": "No", "date": future, "venue": "V", "capacity": 5})

	listed := map[string]bool{}
	for _, e := range c.list("", "/api/events") {
		listed[e.(map[string]any)["id"].(string)] = true
	}
	if !listed[evID] || listed[draftID] || listed[unlisted["id"].(string)] {
		t.Errorf("public list: event %v draft %v unlisted %v", listed[evID], listed[draftID], listed[unlisted["id"].(string)])
	}
	c.must(404, annaTok, "GET", "/api/events/"+draftID, nil)
	c.must(200, orgTok, "GET", "/api/events/"+draftID, nil)
	c.must(200, adminTok, "GET", "/api/events/"+draftID, nil)
	c.must(200, "", "GET", "/api/events/"+unlisted["id"].(string), nil)
	c.must(404, annaTok, "POST", "/api/events/"+draftID+"/register", map[string]any{"ticket_type_id": evID, "quantity": 1})

	// ---- Ticket types ----
	free := c.must(201, orgTok, "POST", "/api/events/"+evID+"/ticket-types", map[string]any{"name": "Student", "price": 0, "quantity": 5})
	paid := c.must(201, orgTok, "POST", "/api/events/"+evID+"/ticket-types", map[string]any{"name": "Standard", "price": 3000, "quantity": 20})
	extra := c.must(201, orgTok, "POST", "/api/events/"+evID+"/ticket-types", map[string]any{"name": "Extra", "price": 100, "quantity": 5})
	freeID, paidID, extraID := free["id"].(string), paid["id"].(string), extra["id"].(string)
	c.must(403, org2Tok, "POST", "/api/events/"+evID+"/ticket-types", map[string]any{"name": "Hack", "price": 0, "quantity": 1})
	c.errMsg(400, orgTok, "POST", "/api/events/"+evID+"/ticket-types", map[string]any{"name": "Too many", "price": 0, "quantity": 71})

	// Edit event
	edited := c.must(200, orgTok, "PUT", "/api/events/"+evID, map[string]any{
		"title": "Jazz Night Live", "description": "Live music", "date": future + ":00+05:00", "venue": "NU Hall",
		"capacity": 120, "category": "music", "image_url": "https://example.com/a.jpg", "registration_closes_at": nil})
	if edited["title"] != "Jazz Night Live" || num(edited["capacity"]) != 120 || edited["visibility"] != "public" {
		t.Fatalf("edit: %v", edited)
	}
	if msg := c.errMsg(400, orgTok, "PUT", "/api/events/"+evID, map[string]any{
		"title": "J", "date": future, "venue": "V", "capacity": 10, "category": "music"}); !strings.Contains(msg, "capacity cannot be lower") {
		t.Errorf("capacity below offered: %q", msg)
	}
	c.must(403, org2Tok, "PUT", "/api/events/"+evID, map[string]any{"title": "X", "date": future, "venue": "V", "capacity": 200})
	c.must(404, orgTok, "PUT", "/api/events/not-a-uuid", map[string]any{"title": "X", "date": future, "venue": "V", "capacity": 200})
	// Publish the draft
	pub := c.must(200, orgTok, "PUT", "/api/events/"+draftID, map[string]any{
		"title": "Secret Draft", "date": future, "venue": "X", "capacity": 10, "status": "published"})
	if pub["status"] != "published" || pub["visibility"] != "private" {
		t.Errorf("publish draft: %v", pub)
	}

	// ---- Free registration and paid checkout before activation ----
	c.must(201, annaTok, "POST", "/api/events/"+evID+"/register", map[string]any{"ticket_type_id": freeID, "quantity": 2})
	c.errMsg(400, annaTok, "POST", "/api/events/"+evID+"/register", map[string]any{"ticket_type_id": paidID, "quantity": 1})
	if msg := c.errMsg(400, annaTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "items": []any{map[string]any{"ticket_type_id": paidID, "quantity": 1}}}); !strings.Contains(msg, "not activated") {
		t.Errorf("paid before activation: %q", msg)
	}

	// ---- Activation ----
	act := c.must(200, orgTok, "GET", "/api/organizer/events/"+evID+"/activation", nil)
	if act["activated"] != false || num(act["fee_kzt"]) != kzFeeKZT {
		t.Fatalf("activation start: %v", act)
	}
	c.errMsg(400, orgTok, "POST", "/api/organizer/events/"+evID+"/activation/activate", nil)
	c.errMsg(400, orgTok, "POST", "/api/organizer/events/"+evID+"/activation/payout", nil)
	c.must(403, org2Tok, "POST", "/api/organizer/events/"+evID+"/activation/identity", nil)
	c.must(404, orgTok, "POST", "/api/organizer/events/"+evID+"/activation/bribe", nil)
	for _, step := range []string{"identity", "fee", "terms"} {
		c.must(200, orgTok, "POST", "/api/organizer/events/"+evID+"/activation/"+step, nil)
	}
	// Profile with payout details
	prof := c.must(200, orgTok, "GET", "/api/organizer/profile", nil)
	if prof["display_name"] != "Org" || prof["contact_email"] != strings.ToLower(mail("Org")) {
		t.Errorf("profile defaults: %v", prof)
	}
	c.errMsg(400, orgTok, "PUT", "/api/organizer/profile", map[string]any{"display_name": "NU Jazz Club",
		"payout": map[string]any{"holder_name": "A", "bank_name": "Kaspi", "iban": "DE89370400440532013000", "bin_iin": ""}})
	c.must(200, orgTok, "PUT", "/api/organizer/profile", map[string]any{"display_name": "NU Jazz Club", "bio": "We play jazz",
		"contact_email": "club@nu.edu.kz", "phone": "+7 700 000 00 00", "website": "https://nu.edu.kz", "city": "Astana",
		"payout": map[string]any{"holder_name": "NU Jazz Club", "bank_name": "Kaspi", "iban": "KZ12 3456 7890 1234 5678", "bin_iin": "123456789012"}})
	c.must(200, orgTok, "POST", "/api/organizer/events/"+evID+"/activation/payout", nil)
	act = c.must(200, orgTok, "POST", "/api/organizer/events/"+evID+"/activation/activate", nil)
	if act["activated"] != true || act["paid_sales"] != "active" {
		t.Fatalf("activate: %v", act)
	}
	if got := c.must(200, "", "GET", "/api/events/"+evID, nil)["organizer_name"]; got != "NU Jazz Club" {
		t.Errorf("organizer_name from profile = %v", got)
	}

	// ---- Promo ----
	camp := c.must(201, orgTok, "POST", "/api/organizer/campaigns", map[string]any{
		"event_id": evID, "name": "Student week", "discount_type": "percent", "amount": 20,
		"starts_at": time.Now().In(kzZone).Format("2006-01-02"), "ends_at": future[:10] + "T23:59:59", "max_redemptions": 1})
	code := camp["code"].(string)
	if !strings.HasPrefix(code, "STUDENTWEE-") || len(code) != len("STUDENTWEE-ABCD") {
		t.Errorf("code %q", code)
	}
	c.must(201, org2Tok, "POST", "/api/organizer/campaigns", map[string]any{
		"name": "Other", "discount_type": "fixed", "amount": 500, "starts_at": "2026-01-01", "ends_at": future[:10], "max_redemptions": 5})
	c.must(403, org2Tok, "POST", "/api/organizer/campaigns", map[string]any{
		"event_id": evID, "name": "Steal", "discount_type": "fixed", "amount": 500, "starts_at": "2026-01-01", "ends_at": future[:10], "max_redemptions": 5})
	c.errMsg(400, orgTok, "POST", "/api/organizer/campaigns", map[string]any{
		"name": "Too much", "discount_type": "percent", "amount": 150, "starts_at": "2026-01-01", "ends_at": future[:10], "max_redemptions": 5})
	if l := c.list(orgTok, "/api/organizer/campaigns"); len(l) != 1 {
		t.Errorf("own campaigns = %d, want 1", len(l))
	}
	v := c.must(200, annaTok, "POST", "/api/promo/validate", map[string]any{"event_id": evID, "code": strings.ToLower(code)})
	if v["code"] != code || v["discount_type"] != "percent" || num(v["amount"]) != 20 {
		t.Errorf("validate: %v", v)
	}
	c.errMsg(400, annaTok, "POST", "/api/promo/validate", map[string]any{"event_id": evID, "code": "NOPE-1234"})

	// ---- Paid checkout ----
	failedOrder := c.must(200, benTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "items": []any{map[string]any{"ticket_type_id": paidID, "quantity": 1}}, "simulate": "failure"})
	if failedOrder["status"] != "failed" || len(failedOrder["tickets"].([]any)) != 0 {
		t.Fatalf("failed payment: %v", failedOrder)
	}
	order := c.must(201, annaTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "promo_code": code, "simulate": "success",
		"items": []any{map[string]any{"ticket_type_id": paidID, "quantity": 2}, map[string]any{"ticket_type_id": freeID, "quantity": 1}}})
	if order["status"] != "paid" || num(order["subtotal"]) != 6000 || num(order["discount"]) != 1200 || num(order["total"]) != 4800 ||
		len(order["tickets"].([]any)) != 3 {
		t.Fatalf("paid order: %v", order)
	}
	paidOrderID := order["order_id"].(string)
	if msg := c.errMsg(400, benTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "promo_code": code, "items": []any{map[string]any{"ticket_type_id": paidID, "quantity": 1}}}); !strings.Contains(msg, "used up") {
		t.Errorf("promo max redemptions: %q", msg)
	}
	c.errMsg(400, benTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "items": []any{map[string]any{"ticket_type_id": paidID, "quantity": 11}}})
	c.errMsg(409, benTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "items": []any{map[string]any{"ticket_type_id": freeID, "quantity": 3}}})
	c.must(201, benTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "items": []any{map[string]any{"ticket_type_id": paidID, "quantity": 1}}})

	evNow := c.must(200, "", "GET", "/api/events/"+evID, nil)
	for _, tt := range evNow["ticket_types"].([]any) {
		m := tt.(map[string]any)
		if m["id"] == paidID && num(m["quantity_left"]) != 17 || m["id"] == freeID && num(m["quantity_left"]) != 2 {
			t.Errorf("stock after orders: %v", m)
		}
	}

	// ---- Orders ----
	myOrders := c.list(annaTok, "/api/my-orders")
	if len(myOrders) != 2 {
		t.Fatalf("anna orders = %d, want 2", len(myOrders))
	}
	statuses := map[string]bool{}
	for _, o := range myOrders {
		statuses[o.(map[string]any)["status"].(string)] = true
	}
	if !statuses["paid"] || !statuses["free"] {
		t.Errorf("anna order statuses: %v", statuses)
	}
	first := myOrders[0].(map[string]any)
	if first["id"] != paidOrderID || len(first["items"].([]any)) != 2 || first["promo_code"] != code {
		t.Errorf("latest order: %v", first)
	}
	benOrders := c.list(benTok, "/api/my-orders")
	if len(benOrders) != 2 || benOrders[1].(map[string]any)["status"] != "failed" {
		t.Errorf("ben orders: %v", benOrders)
	}
	evOrders := c.list(orgTok, "/api/organizer/events/"+evID+"/orders")
	if len(evOrders) != 4 || evOrders[0].(map[string]any)["attendee"] == nil {
		t.Fatalf("event orders: %d %v", len(evOrders), evOrders)
	}
	c.must(403, org2Tok, "GET", "/api/organizer/events/"+evID+"/orders", nil)
	c.must(200, orgTok, "PUT", "/api/organizer/events/"+evID+"/refund-policy", map[string]any{"policy": "Full refund until 3 days before."})
	if p := c.must(200, orgTok, "GET", "/api/organizer/events/"+evID+"/refund-policy", nil); p["policy"] != "Full refund until 3 days before." {
		t.Errorf("policy: %v", p)
	}

	// Refund the paid order: tickets invalid, stock back.
	c.errMsg(400, orgTok, "POST", "/api/organizer/orders/"+paidOrderID+"/refund", map[string]any{"reason": ""})
	c.must(404, org2Tok, "POST", "/api/organizer/orders/"+paidOrderID+"/refund", map[string]any{"reason": "mine"})
	c.errMsg(409, orgTok, "POST", "/api/organizer/orders/"+paidOrderID+"/cancel", map[string]any{"reason": "wrong"})
	c.must(200, orgTok, "POST", "/api/organizer/orders/"+paidOrderID+"/refund", map[string]any{"reason": "Asked by attendee"})
	c.errMsg(409, orgTok, "POST", "/api/organizer/orders/"+paidOrderID+"/refund", map[string]any{"reason": "again"})
	for _, o := range c.list(annaTok, "/api/my-orders") {
		m := o.(map[string]any)
		if m["id"] == paidOrderID {
			if m["status"] != "refunded" {
				t.Errorf("refunded order status %v", m["status"])
			}
			for _, tk := range m["tickets"].([]any) {
				if tk.(map[string]any)["status"] != "refunded" {
					t.Errorf("ticket after refund: %v", tk)
				}
			}
		}
	}
	var freeOrderID string
	for _, o := range evOrders {
		m := o.(map[string]any)
		if m["status"] == "free" {
			freeOrderID = m["id"].(string)
		}
	}
	c.errMsg(409, orgTok, "POST", "/api/organizer/orders/"+freeOrderID+"/refund", map[string]any{"reason": "x"})
	c.must(200, orgTok, "POST", "/api/organizer/orders/"+freeOrderID+"/cancel", map[string]any{"reason": "Duplicate"})

	// ---- Attendees, check-in, analytics, history ----
	att := c.list(orgTok, "/api/organizer/events/"+evID+"/attendees")
	if len(att) != 6 { // 2 free (cancelled) + 3 refunded + 1 Ben
		t.Errorf("attendees = %d, want 6", len(att))
	}
	var benQR string
	for _, tk := range c.list(benTok, "/api/my-tickets") {
		m := tk.(map[string]any)
		if m["status"] == "valid" {
			benQR = m["qr_code"].(string)
		}
		if m["event"].(map[string]any)["image_url"] != "https://example.com/a.jpg" {
			t.Errorf("my-tickets image_url: %v", m["event"])
		}
	}
	ci := c.must(200, orgTok, "POST", "/api/checkin", map[string]any{"event_id": evID, "qr_code": benQR})
	if ci["result"] != "valid" {
		t.Errorf("checkin: %v", ci)
	}
	var benOrderID string
	for _, o := range c.list(benTok, "/api/my-orders") {
		if m := o.(map[string]any); m["status"] == "paid" {
			benOrderID = m["id"].(string)
		}
	}
	if msg := c.errMsg(409, orgTok, "POST", "/api/organizer/orders/"+benOrderID+"/refund", map[string]any{"reason": "late"}); !strings.Contains(msg, "already used") {
		t.Errorf("refund after check-in: %q", msg)
	}
	an := c.must(200, orgTok, "GET", "/api/organizer/events/"+evID+"/analytics", nil)
	rev := an["revenue"].(map[string]any)
	if num(an["sold"]) != 1 || num(an["checked_in"]) != 1 || num(rev["gross"]) != 9000 || num(rev["discounts"]) != 1200 ||
		num(rev["refunds"]) != 4800 || num(rev["net"]) != 3000 || len(an["promo"].([]any)) != 1 || len(an["by_ticket_type"].([]any)) != 3 {
		t.Errorf("analytics: %v", an)
	}
	hist := c.must(200, orgTok, "GET", "/api/organizer/events/"+evID+"/history", nil)
	types := map[string]int{}
	for _, a := range hist["activity"].([]any) {
		types[a.(map[string]any)["type"].(string)]++
	}
	if types["event"] < 2 || types["tickets"] != 3 || types["orders"] < 6 || types["checkin"] != 1 || types["payments"] != 5 {
		t.Errorf("history types: %v", types)
	}

	// ---- Ticket type edit/delete ----
	c.errMsg(409, orgTok, "PUT", "/api/events/"+evID+"/ticket-types/"+paidID, map[string]any{"name": "Standard", "price": 3500, "quantity": 20})
	c.errMsg(400, orgTok, "PUT", "/api/events/"+evID+"/ticket-types/"+paidID, map[string]any{"name": "Standard", "price": 3000, "quantity": 0})
	tt := c.must(200, orgTok, "PUT", "/api/events/"+evID+"/ticket-types/"+paidID, map[string]any{"name": "Standard entry", "price": 3000, "quantity": 30})
	if num(tt["quantity_left"]) != 29 {
		t.Errorf("update type: %v", tt)
	}
	c.errMsg(409, orgTok, "DELETE", "/api/events/"+evID+"/ticket-types/"+paidID, nil)
	c.must(200, orgTok, "DELETE", "/api/events/"+evID+"/ticket-types/"+extraID, nil)

	// ---- Reports and admin ----
	c.must(201, annaTok, "POST", "/api/events/"+evID+"/report", map[string]any{"reason": "Looks fake"})
	c.errMsg(409, annaTok, "POST", "/api/events/"+evID+"/report", map[string]any{"reason": "Again"})
	c.errMsg(400, orgTok, "POST", "/api/events/"+evID+"/report", map[string]any{"reason": "Self"})
	c.must(403, annaTok, "GET", "/api/admin/users", nil)
	if l := c.list(adminTok, "/api/admin/users"); len(l) < 5 {
		t.Errorf("admin users = %d", len(l))
	}
	var adminEv map[string]any
	for _, e := range c.list(adminTok, "/api/admin/events") {
		if e.(map[string]any)["id"] == evID {
			adminEv = e.(map[string]any)
		}
	}
	if adminEv == nil || len(adminEv["reports"].([]any)) != 1 || adminEv["activation"].(map[string]any)["paid_sales"] != "active" ||
		num(adminEv["tickets_sold"]) != 1 || num(adminEv["revenue_kzt"]) != 3000 {
		t.Fatalf("admin event: %v", adminEv)
	}
	if st := c.must(200, adminTok, "GET", "/api/admin/stats", nil); num(st["failed_payments_7d"]) < 1 {
		t.Errorf("stats: %v", st)
	}
	c.errMsg(400, adminTok, "POST", "/api/admin/events/"+evID+"/stop-sales", map[string]any{"reason": " "})
	c.must(200, adminTok, "POST", "/api/admin/events/"+evID+"/stop-sales", map[string]any{"reason": "Checking payouts"})
	if msg := c.errMsg(400, benTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "items": []any{map[string]any{"ticket_type_id": paidID, "quantity": 1}}}); !strings.Contains(msg, "paused") {
		t.Errorf("checkout after stop: %q", msg)
	}
	c.must(200, adminTok, "POST", "/api/admin/events/"+evID+"/resume-sales", map[string]any{"reason": "OK now"})
	c.must(200, adminTok, "POST", "/api/admin/events/"+evID+"/suspend", map[string]any{"reason": "Reported"})
	c.must(404, benTok, "GET", "/api/events/"+evID, nil)
	c.must(200, orgTok, "GET", "/api/events/"+evID, nil)
	for _, e := range c.list("", "/api/events") {
		if e.(map[string]any)["id"] == evID {
			t.Error("suspended event still listed")
		}
	}
	c.errMsg(409, adminTok, "POST", "/api/admin/events/"+evID+"/resume-sales", map[string]any{"reason": "x"})
	restored := c.must(200, adminTok, "POST", "/api/admin/events/"+evID+"/restore", map[string]any{"reason": "Fine"})
	if restored["suspended"] != false || restored["paid_sales"] != "stopped" {
		t.Errorf("restore: %v", restored)
	}
	c.must(200, adminTok, "POST", "/api/admin/events/"+evID+"/resume-sales", map[string]any{"reason": "Fine"})

	c.errMsg(400, adminTok, "POST", "/api/admin/users/"+adminID+"/suspend", map[string]any{"reason": "me"})
	c.must(200, adminTok, "POST", "/api/admin/users/"+annaID+"/suspend", map[string]any{"reason": "Abuse"})
	c.must(403, annaTok, "GET", "/api/my-tickets", nil)
	c.must(403, "", "POST", "/api/auth/login", map[string]any{"email": mail("Anna"), "password": "password123"})
	c.must(200, adminTok, "POST", "/api/admin/users/"+annaID+"/unsuspend", map[string]any{"reason": "Appeal"})
	c.must(200, annaTok, "GET", "/api/my-tickets", nil)
	if l := c.list(adminTok, "/api/admin/audit"); len(l) < 10 {
		t.Errorf("audit entries = %d", len(l))
	}

	// ---- Support ----
	cs := c.must(201, annaTok, "POST", "/api/support/cases", map[string]any{"category": "payment", "subject": "Refund",
		"message": "Where is my refund money?", "context": map[string]any{"type": "order", "id": paidOrderID}})
	caseID := fmt.Sprint(num(cs["id"]))
	c.errMsg(400, annaTok, "POST", "/api/support/cases", map[string]any{"category": "payment", "subject": "x", "message": "short"})
	c.must(404, benTok, "GET", "/api/support/cases/"+caseID, nil)
	c.must(404, benTok, "POST", "/api/support/cases/"+caseID+"/messages", map[string]any{"body": "hi"})
	if l := c.list(annaTok, "/api/support/cases"); len(l) != 1 {
		t.Errorf("my cases = %d", len(l))
	}
	if l := c.list(adminTok, "/api/admin/support/cases?status=open"); len(l) < 1 {
		t.Errorf("admin open cases = %d", len(l))
	}
	pc := c.must(200, adminTok, "PATCH", "/api/admin/support/cases/"+caseID, map[string]any{"assign_to_me": true})
	if pc["status"] != "in_progress" || pc["assignee"].(map[string]any)["id"] != adminID {
		t.Errorf("assign: %v", pc)
	}
	c.must(201, adminTok, "POST", "/api/admin/support/cases/"+caseID+"/messages", map[string]any{"body": "It was refunded today."})
	got := c.must(200, annaTok, "GET", "/api/support/cases/"+caseID, nil)
	if got["status"] != "waiting" || len(got["messages"].([]any)) != 2 {
		t.Errorf("after admin reply: %v", got)
	}
	c.must(201, annaTok, "POST", "/api/support/cases/"+caseID+"/messages", map[string]any{"body": "Thanks!"})
	c.must(200, adminTok, "PATCH", "/api/admin/support/cases/"+caseID, map[string]any{"status": "resolved"})
	c.errMsg(400, adminTok, "PATCH", "/api/admin/support/cases/"+caseID, map[string]any{"status": "lost"})
	c.must(404, annaTok, "GET", "/api/support/cases/abc", nil)

	// ---- Account: reset password, verify email ----
	c.must(200, "", "POST", "/api/auth/forgot-password", map[string]any{"email": "nobody@nowhere.kz"})
	c.must(200, "", "POST", "/api/auth/forgot-password", map[string]any{"email": mail("Ben")})
	var benID string
	if err := s.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, mail("Ben")).Scan(&benID); err != nil {
		t.Fatal(err)
	}
	resetTok, err := s.newAccountToken(ctx, benID, "reset_password", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	c.errMsg(400, "", "POST", "/api/auth/reset-password", map[string]any{"token": resetTok, "password": "short"})
	c.must(200, "", "POST", "/api/auth/reset-password", map[string]any{"token": resetTok, "password": "newpassword1"})
	c.errMsg(400, "", "POST", "/api/auth/reset-password", map[string]any{"token": resetTok, "password": "newpassword2"})
	c.must(401, "", "POST", "/api/auth/login", map[string]any{"email": mail("Ben"), "password": "password123"})
	c.must(200, "", "POST", "/api/auth/login", map[string]any{"email": mail("Ben"), "password": "newpassword1"})
	verifyTok, err := s.newAccountToken(ctx, annaID, "verify_email", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	c.must(200, "", "POST", "/api/auth/verify-email", map[string]any{"token": verifyTok})
	if me := c.must(200, annaTok, "GET", "/api/me", nil); me["email_verified"] != true {
		t.Errorf("verified: %v", me)
	}
	c.errMsg(400, "", "POST", "/api/auth/verify-email", map[string]any{"token": "garbage"})
	c.must(200, annaTok, "POST", "/api/auth/resend-verification", map[string]any{})

	// ---- Cancel the event ----
	c.errMsg(400, orgTok, "POST", "/api/organizer/events/"+evID+"/cancel", map[string]any{"reason": ""})
	c.must(403, org2Tok, "POST", "/api/organizer/events/"+evID+"/cancel", map[string]any{"reason": "mine"})
	res := c.must(200, orgTok, "POST", "/api/organizer/events/"+evID+"/cancel", map[string]any{"reason": "Venue flooded"})
	if num(res["refunded_orders"]) != 1 {
		t.Errorf("cancel event: %v", res)
	}
	if e := c.must(200, "", "GET", "/api/events/"+evID, nil); e["status"] != "cancelled" {
		t.Errorf("cancelled status: %v", e["status"])
	}
	c.errMsg(409, orgTok, "PUT", "/api/events/"+evID, map[string]any{"title": "X", "date": future, "venue": "V", "capacity": 200})
	c.errMsg(400, benTok, "POST", "/api/orders/checkout", map[string]any{
		"event_id": evID, "items": []any{map[string]any{"ticket_type_id": paidID, "quantity": 1}}})
	for _, e := range c.list(orgTok, "/api/organizer/events") {
		if m := e.(map[string]any); m["id"] == evID && m["status"] != "cancelled" {
			t.Errorf("dashboard status: %v", m["status"])
		}
	}
	for _, tk := range c.list(benTok, "/api/my-tickets") {
		m := tk.(map[string]any)
		if m["event"].(map[string]any)["id"] == evID && m["status"] == "valid" {
			t.Error("a ticket of the cancelled event is still valid")
		}
	}
}
