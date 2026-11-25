package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Ticket type sale rules (SRS 4.3): sales window, limit per order, hiding.

func TestSaleBlocked(t *testing.T) {
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	at := func(d time.Duration) *time.Time { v := now.Add(d); return &v }
	five, one := 5, 1

	cases := []struct {
		name   string
		t      TicketType
		qty    int
		status int
		msg    string
	}{
		{"no rules", TicketType{Name: "VIP"}, 10, 0, ""},
		{"hidden", TicketType{Name: "VIP", Hidden: true}, 1, 404, "ticket type not found for this event"},
		{"hidden wins over every other rule", TicketType{Name: "VIP", Hidden: true, SalesStartsAt: at(time.Hour), MaxPerOrder: &one}, 9, 404, "ticket type not found for this event"},
		{"before start", TicketType{Name: "VIP", SalesStartsAt: at(time.Second)}, 1, 400, "sales for VIP have not started yet"},
		{"exactly at start is open", TicketType{Name: "VIP", SalesStartsAt: at(0)}, 1, 0, ""},
		{"after start", TicketType{Name: "VIP", SalesStartsAt: at(-time.Hour)}, 1, 0, ""},
		{"after end", TicketType{Name: "VIP", SalesEndsAt: at(-time.Second)}, 1, 400, "sales for VIP have ended"},
		{"exactly at end is closed", TicketType{Name: "VIP", SalesEndsAt: at(0)}, 1, 400, "sales for VIP have ended"},
		{"before end", TicketType{Name: "VIP", SalesEndsAt: at(time.Second)}, 1, 0, ""},
		{"inside the window", TicketType{Name: "VIP", SalesStartsAt: at(-time.Hour), SalesEndsAt: at(time.Hour)}, 1, 0, ""},
		{"over max_per_order", TicketType{Name: "VIP", MaxPerOrder: &five}, 6, 400, "you can buy at most 5 VIP tickets in one order"},
		{"exactly max_per_order", TicketType{Name: "VIP", MaxPerOrder: &five}, 5, 0, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, msg := saleBlocked(tc.t, tc.qty, now)
			if status != tc.status || msg != tc.msg {
				t.Fatalf("saleBlocked = %d %q, want %d %q", status, msg, tc.status, tc.msg)
			}
		})
	}
}

// Validation of the new fields happens before any database access.
func TestTicketTypeSaleValidation(t *testing.T) {
	s := newTestServer()
	mux := s.routes()
	path := "/api/events/" + sampleEventID + "/ticket-types"
	base := func(extra string) string {
		return `{"name":"VIP","price":0,"quantity":5` + extra + `}`
	}
	for name, extra := range map[string]string{
		"max_per_order 0":              `,"max_per_order":0`,
		"max_per_order 11":             `,"max_per_order":11`,
		"max_per_order negative":       `,"max_per_order":-1`,
		"max_per_order not an integer": `,"max_per_order":1.5`,
		"max_per_order a string":       `,"max_per_order":"3"`,
		"hidden not a bool":            `,"hidden":"yes"`,
		"start after end":              `,"sales_starts_at":"2026-07-02T10:00:00Z","sales_ends_at":"2026-07-01T10:00:00Z"`,
		"start equals end":             `,"sales_starts_at":"2026-07-01T10:00:00Z","sales_ends_at":"2026-07-01T10:00:00Z"`,
		"bad date":                     `,"sales_starts_at":"tomorrow-ish"`,
	} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, authedRequest(t, s, "organizer", "POST", path, base(extra)))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400 (%s)", name, rec.Code, rec.Body.String())
		}
		errorOf(t, rec)
	}
}

func TestTicketSalesDB(t *testing.T) {
	s := newDBTestServer(t)
	srv := httptest.NewServer(s.routes())
	defer srv.Close()
	c := apiClient{t: t, srv: srv}
	ctx := context.Background()

	stamp := time.Now().UnixNano()
	newUser := func(name, role string) string {
		var id string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, full_name, role)
			VALUES ($1, 'x', $2, $3) RETURNING id`,
			fmt.Sprintf("%s-%d@test.biletflow.local", strings.ToLower(name), stamp), name, role).Scan(&id); err != nil {
			t.Fatalf("create user %s: %v", name, err)
		}
		return id
	}
	org := newUser("SalesOrg", "organizer")
	other := newUser("SalesOther", "organizer")
	admin := newUser("SalesAdmin", "platform_admin")
	buyer := newUser("SalesBuyer", "attendee")
	ids := []string{org, other, admin, buyer}
	t.Cleanup(func() {
		_, _ = s.db.Exec(ctx, `DELETE FROM tickets WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM orders WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM events WHERE organizer_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, ids)
	})
	tokOrg := mustToken(t, s, org, "organizer")
	tokOther := mustToken(t, s, other, "organizer")
	tokAdmin := mustToken(t, s, admin, "platform_admin")
	tokBuyer := mustToken(t, s, buyer, "attendee")

	var ev string
	if err := s.db.QueryRow(ctx, `
		INSERT INTO events (organizer_id, title, date, venue, capacity, status)
		VALUES ($1, 'Sales Concert', now() + interval '30 days', 'Test Hall', 500, 'published') RETURNING id`,
		org).Scan(&ev); err != nil {
		t.Fatal(err)
	}
	typesURL := "/api/events/" + ev + "/ticket-types"
	hour := func(h int) string { return time.Now().Add(time.Duration(h) * time.Hour).UTC().Format(time.RFC3339) }

	// All types are free so checkout works without activating paid sales.
	create := func(name string, extra map[string]any) string {
		body := map[string]any{"name": name, "price": 0, "quantity": 50}
		for k, v := range extra {
			body[k] = v
		}
		return fmt.Sprint(c.must(201, tokOrg, "POST", typesURL, body)["id"])
	}
	plain := create("Plain", nil)
	secret := create("Secret", map[string]any{"hidden": true})
	early := create("Early", map[string]any{"sales_starts_at": hour(2)})
	over := create("Over", map[string]any{"sales_ends_at": hour(-2)})
	capped := create("Capped", map[string]any{"max_per_order": 2})

	register := func(typeID string, qty int) (int, string) {
		code, out := c.call(tokBuyer, "POST", "/api/events/"+ev+"/register", map[string]any{"ticket_type_id": typeID, "quantity": qty})
		m, _ := out.(map[string]any)
		msg, _ := m["error"].(string)
		return code, msg
	}
	checkout := func(typeID string, qty int) (int, string) {
		code, out := c.call(tokBuyer, "POST", "/api/orders/checkout", map[string]any{
			"event_id": ev, "items": []map[string]any{{"ticket_type_id": typeID, "quantity": qty}}})
		m, _ := out.(map[string]any)
		msg, _ := m["error"].(string)
		return code, msg
	}
	left := func(typeID string) int {
		var n int
		if err := s.db.QueryRow(ctx, `SELECT quantity_left FROM ticket_types WHERE id = $1`, typeID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	t.Run("the rules are enforced in both register and checkout", func(t *testing.T) {
		for name, buy := range map[string]func(string, int) (int, string){"register": register, "checkout": checkout} {
			for _, tc := range []struct {
				rule   string
				typeID string
				qty    int
				status int
				msg    string
			}{
				{"hidden type", secret, 1, 404, "ticket type not found for this event"},
				{"before start", early, 1, 400, "sales for Early have not started yet"},
				{"after end", over, 1, 400, "sales for Over have ended"},
				{"above max_per_order", capped, 3, 400, "you can buy at most 2 Capped tickets in one order"},
				{"exactly max_per_order", capped, 2, 0, ""},
				{"type without rules", plain, 1, 0, ""},
			} {
				code, msg := buy(tc.typeID, tc.qty)
				ok := msg == tc.msg
				if tc.status == 0 {
					ok = code < 300
				} else {
					ok = ok && code == tc.status
				}
				if !ok {
					t.Errorf("%s / %s: got %d %q, want %d %q", name, tc.rule, code, msg, tc.status, tc.msg)
				}
			}
		}
		// Refused purchases must not take stock; the four successful ones took 2+2 and 1+1.
		for typeID, want := range map[string]int{secret: 50, early: 50, over: 50, capped: 46, plain: 48} {
			if got := left(typeID); got != want {
				t.Errorf("quantity_left of %s = %d, want %d", typeID, got, want)
			}
		}
	})

	t.Run("a start or end in the past or future moves the window", func(t *testing.T) {
		c.must(200, tokOrg, "PUT", typesURL+"/"+early, map[string]any{"name": "Early", "price": 0, "quantity": 50, "sales_starts_at": hour(-1)})
		if code, msg := register(early, 1); code >= 300 {
			t.Fatalf("after the start passed: %d %q", code, msg)
		}
		c.must(200, tokOrg, "PUT", typesURL+"/"+over, map[string]any{"name": "Over", "price": 0, "quantity": 50, "sales_ends_at": nil})
		if code, msg := checkout(over, 1); code >= 300 {
			t.Fatalf("after clearing the end: %d %q", code, msg)
		}
	})

	t.Run("hidden types are shown only to the organizer and platform admins", func(t *testing.T) {
		names := func(token string) map[string]bool {
			got := map[string]bool{}
			detail := c.must(200, token, "GET", "/api/events/"+ev, nil)
			for _, x := range detail["ticket_types"].([]any) {
				m := x.(map[string]any)
				got[m["name"].(string)] = m["hidden"] == true
			}
			return got
		}
		for who, token := range map[string]string{"anonymous": "", "attendee": tokBuyer, "other organizer": tokOther} {
			if _, found := names(token)["Secret"]; found {
				t.Errorf("%s sees the hidden type", who)
			}
			if len(names(token)) != 4 {
				t.Errorf("%s sees %v, want the 4 public types", who, names(token))
			}
		}
		for who, token := range map[string]string{"organizer": tokOrg, "platform admin": tokAdmin} {
			got := names(token)
			if hidden, found := got["Secret"]; !found || !hidden || len(got) != 5 || got["Plain"] {
				t.Errorf("%s sees %v, want all 5 types with Secret hidden:true", who, got)
			}
		}
	})

	t.Run("min_price in the event list ignores hidden types", func(t *testing.T) {
		pricey := create("Pricey", map[string]any{"price": 90})
		_ = pricey
		c.must(200, tokOrg, "PUT", typesURL+"/"+plain, map[string]any{"name": "Plain", "price": 0, "quantity": 50, "hidden": true})
		c.must(200, tokOrg, "PUT", typesURL+"/"+capped, map[string]any{"name": "Capped", "price": 0, "quantity": 50, "hidden": true})
		c.must(200, tokOrg, "PUT", typesURL+"/"+early, map[string]any{"name": "Early", "price": 0, "quantity": 50, "hidden": true})
		c.must(200, tokOrg, "PUT", typesURL+"/"+over, map[string]any{"name": "Over", "price": 0, "quantity": 50, "hidden": true})
		c.must(200, tokOrg, "PUT", typesURL+"/"+secret, map[string]any{"name": "Secret", "price": 0, "quantity": 50, "hidden": true})
		for _, x := range c.list("", "/api/events") {
			if m := x.(map[string]any); m["id"] == ev && num(m["min_price"]) != 90 {
				t.Errorf("min_price = %v, want 90 (only Pricey is visible)", m["min_price"])
			}
		}
	})

	t.Run("create and update: fields returned, omitted keeps, null clears", func(t *testing.T) {
		start, end := hour(1), hour(5)
		m := c.must(201, tokOrg, "POST", typesURL, map[string]any{
			"name": "Rules", "price": 0, "quantity": 10,
			"sales_starts_at": start, "sales_ends_at": end, "max_per_order": 4, "hidden": true})
		id := fmt.Sprint(m["id"])
		if m["sales_starts_at"] == nil || m["sales_ends_at"] == nil || num(m["max_per_order"]) != 4 || m["hidden"] != true {
			t.Fatalf("created type = %v", m)
		}
		// Only the name changes: all four sale rules stay.
		m = c.must(200, tokOrg, "PUT", typesURL+"/"+id, map[string]any{"name": "Rules 2", "price": 0, "quantity": 10})
		if m["sales_starts_at"] == nil || m["sales_ends_at"] == nil || num(m["max_per_order"]) != 4 || m["hidden"] != true {
			t.Fatalf("omitted fields were not kept: %v", m)
		}
		// null clears each of them; hidden is switched off explicitly.
		m = c.must(200, tokOrg, "PUT", typesURL+"/"+id, map[string]any{
			"name": "Rules 2", "price": 0, "quantity": 10,
			"sales_starts_at": nil, "sales_ends_at": nil, "max_per_order": nil, "hidden": false})
		if m["sales_starts_at"] != nil || m["sales_ends_at"] != nil || m["max_per_order"] != nil || m["hidden"] != false {
			t.Fatalf("null did not clear: %v", m)
		}
		// A type created without the new fields has them empty and is visible.
		m = c.must(201, tokOrg, "POST", typesURL, map[string]any{"name": "Bare", "price": 0, "quantity": 10})
		if m["sales_starts_at"] != nil || m["sales_ends_at"] != nil || m["max_per_order"] != nil || m["hidden"] != false {
			t.Fatalf("defaults = %v", m)
		}
	})

	t.Run("validation is applied to the stored combination", func(t *testing.T) {
		id := create("Window", map[string]any{"sales_starts_at": hour(1), "sales_ends_at": hour(5)})
		put := func(extra map[string]any) {
			body := map[string]any{"name": "Window", "price": 0, "quantity": 50}
			for k, v := range extra {
				body[k] = v
			}
			c.errMsg(400, tokOrg, "PUT", typesURL+"/"+id, body)
		}
		put(map[string]any{"sales_starts_at": hour(6)}) // start moved past the stored end
		put(map[string]any{"sales_ends_at": hour(0)})   // end moved before the stored start
		put(map[string]any{"max_per_order": 0})
		put(map[string]any{"max_per_order": 11})
		c.errMsg(400, tokOrg, "POST", typesURL, map[string]any{"name": "Bad", "price": 0, "quantity": 5, "max_per_order": 11})
		if code, _ := c.call(tokOrg, "PUT", typesURL+"/"+id, map[string]any{"name": "Window", "price": 0, "quantity": 50, "sales_starts_at": hour(2), "sales_ends_at": hour(3)}); code != 200 {
			t.Errorf("valid change: %d", code)
		}
	})

	t.Run("the database refuses max_per_order outside 1..10", func(t *testing.T) {
		for _, n := range []int{0, 11} {
			if _, err := s.db.Exec(ctx, `UPDATE ticket_types SET max_per_order = $1 WHERE id = $2`, n, plain); err == nil {
				t.Errorf("max_per_order %d accepted by the CHECK constraint", n)
			}
		}
	})
}
