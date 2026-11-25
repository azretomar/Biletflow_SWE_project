package main

import (
	"context"
	"fmt"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"
)

func TestOrganizerSupportDB(t *testing.T) {
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
	newEvent := func(organizerID, title string) string {
		var id string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO events (organizer_id, title, date, venue, capacity)
			VALUES ($1, $2, now() + interval '7 days', 'Test Hall', 100) RETURNING id`,
			organizerID, title).Scan(&id); err != nil {
			t.Fatalf("create event: %v", err)
		}
		return id
	}
	newTicket := func(eventID, userID string) (orderID, ticketID string) {
		var ttID string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO ticket_types (event_id, name, price, quantity, quantity_left)
			VALUES ($1, 'General', 0, 10, 9) RETURNING id`, eventID).Scan(&ttID); err != nil {
			t.Fatalf("create ticket type: %v", err)
		}
		if err := s.db.QueryRow(ctx, `INSERT INTO orders (user_id, event_id) VALUES ($1, $2) RETURNING id`,
			userID, eventID).Scan(&orderID); err != nil {
			t.Fatalf("create order: %v", err)
		}
		qr, err := newQRCode()
		if err != nil {
			t.Fatal(err)
		}
		if err := s.db.QueryRow(ctx, `
			INSERT INTO tickets (order_id, event_id, ticket_type_id, user_id, qr_code)
			VALUES ($1, $2, $3, $4, $5) RETURNING id`, orderID, eventID, ttID, userID, qr).Scan(&ticketID); err != nil {
			t.Fatalf("create ticket: %v", err)
		}
		return orderID, ticketID
	}

	orgA := newUser("OrgA", "organizer")
	orgB := newUser("OrgB", "organizer")
	anna := newUser("Anna", "attendee")
	ben := newUser("Ben", "attendee")
	ids := []string{orgA, orgB, anna, ben}
	t.Cleanup(func() {
		_, _ = s.db.Exec(ctx, `DELETE FROM support_cases WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM tickets WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM orders WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM events WHERE organizer_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, ids)
	})
	tokA := mustToken(t, s, orgA, "organizer")
	tokB := mustToken(t, s, orgB, "organizer")
	tokAnna := mustToken(t, s, anna, "attendee")
	tokBen := mustToken(t, s, ben, "attendee")

	evA := newEvent(orgA, "Concert A")
	evB := newEvent(orgB, "Lecture B")
	orderA, ticketA := newTicket(evA, anna)
	_, ticketB := newTicket(evB, ben)

	open := func(token, category, subject string, ctxType, ctxID string) string {
		body := map[string]any{"category": category, "subject": subject, "message": "Something is wrong, please help."}
		if ctxType != "" {
			body["context"] = map[string]any{"type": ctxType, "id": ctxID}
		}
		return fmt.Sprint(num(c.must(201, token, "POST", "/api/support/cases", body)["id"]))
	}
	c1 := open(tokAnna, "event", "about event A", "event", evA)
	c2 := open(tokAnna, "payment", "about order A", "order", orderA)
	c3 := open(tokAnna, "tickets", "about ticket A", "ticket", strings.ToUpper(ticketA))
	c4 := open(tokAnna, "event", "about event B", "event", evB)
	c5 := open(tokAnna, "tickets", "about Ben's ticket at B", "ticket", ticketB)
	c6 := open(tokAnna, "other", "no context", "", "")
	c7 := open(tokAnna, "organizer", "organizer tools topic", "event", evA)
	c8 := open(tokAnna, "event", "garbage context id", "event", "abc")
	c9 := open(tokA, "payment", "organizer's own case", "event", evA)
	_ = tokBen

	caseIDs := func(token, path string) []string {
		t.Helper()
		var out []string
		for _, x := range c.list(token, path) {
			out = append(out, fmt.Sprint(num(x.(map[string]any)["id"])))
		}
		sort.Strings(out)
		return out
	}
	same := func(got []string, want ...string) {
		t.Helper()
		sort.Strings(want)
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Fatalf("cases = %v, want %v", got, want)
		}
	}

	t.Run("each organizer sees only the cases about their events", func(t *testing.T) {
		same(caseIDs(tokA, "/api/organizer/support/cases"), c1, c2, c3)
		same(caseIDs(tokB, "/api/organizer/support/cases"), c4, c5)
		for _, x := range c.list(tokA, "/api/organizer/support/cases") {
			m := x.(map[string]any)
			ev := m["event"].(map[string]any)
			if ev["id"] != evA || ev["title"] != "Concert A" {
				t.Errorf("event = %v", ev)
			}
			if m["requester"].(map[string]any)["full_name"] != "Anna" {
				t.Errorf("requester = %v", m["requester"])
			}
		}
	})

	t.Run("cases outside the scope are 404 for every endpoint", func(t *testing.T) {
		for _, id := range []string{c4, c5, c6, c7, c8, c9, "999999999", "abc"} {
			c.must(404, tokA, "GET", "/api/organizer/support/cases/"+id, nil)
			c.must(404, tokA, "POST", "/api/organizer/support/cases/"+id+"/messages", map[string]any{"body": "hello"})
			c.must(404, tokA, "PATCH", "/api/organizer/support/cases/"+id, map[string]any{"status": "resolved"})
		}
		for _, id := range []string{c1, c2, c3} {
			c.must(404, tokB, "GET", "/api/organizer/support/cases/"+id, nil)
			c.must(404, tokB, "POST", "/api/organizer/support/cases/"+id+"/messages", map[string]any{"body": "hello"})
			c.must(404, tokB, "PATCH", "/api/organizer/support/cases/"+id, map[string]any{"assign_to_me": true})
		}
		var status string
		var messages int
		if err := s.db.QueryRow(ctx, `SELECT status, (SELECT COUNT(*) FROM support_messages WHERE case_id = c.id)
			FROM support_cases c WHERE c.id = $1`, c1).Scan(&status, &messages); err != nil || status != "open" || messages != 1 {
			t.Fatalf("case %s after refused calls: status %q, %d messages (%v)", c1, status, messages, err)
		}
	})

	t.Run("filters", func(t *testing.T) {
		same(caseIDs(tokA, "/api/organizer/support/cases?status=open"), c1, c2, c3)
		same(caseIDs(tokA, "/api/organizer/support/cases?status=resolved"))
		same(caseIDs(tokA, "/api/organizer/support/cases?event_id="+evA), c1, c2, c3)
		same(caseIDs(tokA, "/api/organizer/support/cases?event_id="+evB))
		c.errMsg(400, tokA, "GET", "/api/organizer/support/cases?status=lost", nil)
		c.errMsg(400, tokA, "GET", "/api/organizer/support/cases?event_id=nope", nil)
	})

	t.Run("open a case", func(t *testing.T) {
		m := c.must(200, tokA, "GET", "/api/organizer/support/cases/"+c1, nil)
		if m["subject"] != "about event A" || len(m["messages"].([]any)) != 1 {
			t.Fatalf("case = %v", m)
		}
	})

	t.Run("reply, reopen, take and resolve", func(t *testing.T) {
		c.errMsg(400, tokA, "POST", "/api/organizer/support/cases/"+c1+"/messages", map[string]any{"body": "   "})
		m := c.must(201, tokA, "POST", "/api/organizer/support/cases/"+c1+"/messages", map[string]any{"body": "We are looking into it."})
		if m["author_role"] != "organizer" || m["author_name"] != "OrgA" {
			t.Fatalf("reply = %v", m)
		}
		same(caseIDs(tokA, "/api/organizer/support/cases?status=waiting"), c1)

		mine := c.must(200, tokAnna, "GET", "/api/support/cases/"+c1, nil)
		if mine["status"] != "waiting" || len(mine["messages"].([]any)) != 2 {
			t.Fatalf("attendee view = %v", mine)
		}
		c.must(201, tokAnna, "POST", "/api/support/cases/"+c1+"/messages", map[string]any{"body": "Thank you!"})
		same(caseIDs(tokA, "/api/organizer/support/cases?status=open"), c1, c2, c3)

		p := c.must(200, tokA, "PATCH", "/api/organizer/support/cases/"+c1, map[string]any{"assign_to_me": true})
		if p["status"] != "in_progress" || p["assignee"].(map[string]any)["id"] != orgA || len(p["messages"].([]any)) != 3 {
			t.Fatalf("after assign: %v", p)
		}
		if p["event"].(map[string]any)["id"] != evA {
			t.Fatalf("patch answer lost its event: %v", p)
		}
		if r := c.must(200, tokA, "PATCH", "/api/organizer/support/cases/"+c1, map[string]any{"status": "resolved"}); r["status"] != "resolved" {
			t.Fatalf("resolve: %v", r)
		}
		c.must(201, tokA, "POST", "/api/organizer/support/cases/"+c1+"/messages", map[string]any{"body": "Closing this."})
		if r := c.must(200, tokA, "GET", "/api/organizer/support/cases/"+c1, nil); r["status"] != "resolved" {
			t.Fatalf("status = %v, want resolved", r["status"])
		}
		c.errMsg(400, tokA, "PATCH", "/api/organizer/support/cases/"+c1, map[string]any{"status": "lost"})
		c.errMsg(400, tokA, "PATCH", "/api/organizer/support/cases/"+c1, map[string]any{})
	})
}
