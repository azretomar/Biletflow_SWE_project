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

func TestUndoCheckinGuards(t *testing.T) {
	s := newTestServer()
	mux := s.routes()
	const path = "/api/checkin/undo"
	valid := fmt.Sprintf(`{"event_id":%q,"ticket_id":%q}`, sampleEventID, sampleTicketTypeID)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, jsonRequest("POST", path, valid))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("no token: status = %d, want 401", rec.Code)
	}
	for _, role := range []string{"attendee", "platform_admin"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, authedRequest(t, s, role, "POST", path, valid))
		if rec.Code != http.StatusForbidden {
			t.Errorf("role %q: status = %d, want 403", role, rec.Code)
		}
		errorOf(t, rec)
	}
	for _, role := range []string{"event_admin", "organizer"} {
		for name, body := range map[string]string{
			"malformed json":     `{"event_id":`,
			"missing event_id":   fmt.Sprintf(`{"ticket_id":%q}`, sampleTicketTypeID),
			"event_id not uuid":  fmt.Sprintf(`{"event_id":"42","ticket_id":%q}`, sampleTicketTypeID),
			"missing ticket_id":  fmt.Sprintf(`{"event_id":%q}`, sampleEventID),
			"ticket_id not uuid": fmt.Sprintf(`{"event_id":%q,"ticket_id":"abc"}`, sampleEventID),
			"unknown field":      fmt.Sprintf(`{"event_id":%q,"ticket_id":%q,"qr_code":"x"}`, sampleEventID, sampleTicketTypeID),
		} {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, authedRequest(t, s, role, "POST", path, body))
			if rec.Code != http.StatusBadRequest {
				t.Errorf("%s/%s: status = %d, want 400", role, name, rec.Code)
			}
			errorOf(t, rec)
		}
	}
}

func TestUndoCheckinDB(t *testing.T) {
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
	newTicket := func(eventID, userID string) (ticketID, qr string) {
		var ttID, orderID string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO ticket_types (event_id, name, price, quantity, quantity_left)
			VALUES ($1, 'General', 0, 10, 9) RETURNING id`, eventID).Scan(&ttID); err != nil {
			t.Fatalf("create ticket type: %v", err)
		}
		if err := s.db.QueryRow(ctx, `INSERT INTO orders (user_id, event_id) VALUES ($1, $2) RETURNING id`,
			userID, eventID).Scan(&orderID); err != nil {
			t.Fatalf("create order: %v", err)
		}
		var err error
		if qr, err = newQRCode(); err != nil {
			t.Fatal(err)
		}
		if err := s.db.QueryRow(ctx, `
			INSERT INTO tickets (order_id, event_id, ticket_type_id, user_id, qr_code)
			VALUES ($1, $2, $3, $4, $5) RETURNING id`, orderID, eventID, ttID, userID, qr).Scan(&ticketID); err != nil {
			t.Fatalf("create ticket: %v", err)
		}
		return ticketID, qr
	}

	orgA := newUser("OrgA", "organizer")
	orgB := newUser("OrgB", "organizer")
	staff := newUser("Staff", "event_admin")
	outsider := newUser("Outsider", "event_admin")
	holder := newUser("Holder", "attendee")
	ids := []string{orgA, orgB, staff, outsider, holder}
	t.Cleanup(func() {
		_, _ = s.db.Exec(ctx, `DELETE FROM tickets WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM orders WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM events WHERE organizer_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, ids)
	})

	concert := newEvent(orgA, "Concert")
	lecture := newEvent(orgA, "Lecture")
	if _, err := s.db.Exec(ctx, `INSERT INTO event_staff (event_id, user_id, assigned_by) VALUES ($1, $2, $3)`,
		concert, staff, orgA); err != nil {
		t.Fatal(err)
	}
	ticket, qr := newTicket(concert, holder)
	lectureTicket, _ := newTicket(lecture, holder)

	tokOrg := mustToken(t, s, orgA, "organizer")
	tokOrgB := mustToken(t, s, orgB, "organizer")
	tokStaff := mustToken(t, s, staff, "event_admin")
	tokOutsider := mustToken(t, s, outsider, "event_admin")
	tokHolder := mustToken(t, s, holder, "attendee")

	undo := func(token, eventID, ticketID string) (int, any) {
		return c.call(token, "POST", "/api/checkin/undo", map[string]any{"event_id": eventID, "ticket_id": ticketID})
	}
	scan := func(token string) any {
		return c.must(200, token, "POST", "/api/checkin", map[string]any{"event_id": concert, "qr_code": qr})["result"]
	}
	dbState := func() (status string, at, by *string) {
		t.Helper()
		if err := s.db.QueryRow(ctx, `SELECT status, checked_in_at::text, checked_in_by::text FROM tickets WHERE id = $1`,
			ticket).Scan(&status, &at, &by); err != nil {
			t.Fatal(err)
		}
		return
	}

	t.Run("access", func(t *testing.T) {
		if code, _ := undo("", concert, ticket); code != 401 {
			t.Errorf("no token: %d", code)
		}
		if code, _ := undo(tokHolder, concert, ticket); code != 403 {
			t.Errorf("attendee: %d", code)
		}
		if code, _ := undo(tokOutsider, concert, ticket); code != 403 {
			t.Errorf("unassigned staff: %d", code)
		}
		if code, _ := undo(tokOrgB, concert, ticket); code != 403 {
			t.Errorf("other organizer: %d", code)
		}
		if code, _ := undo(tokStaff, sampleEventID, ticket); code != 404 {
			t.Errorf("unknown event: %d", code)
		}
		if code, _ := undo(tokStaff, concert, lectureTicket); code != 404 {
			t.Errorf("ticket of another event: %d", code)
		}
		if code, _ := undo(tokStaff, concert, sampleTicketTypeID); code != 404 {
			t.Errorf("unknown ticket: %d", code)
		}
	})

	t.Run("a ticket that is not checked in gives 409", func(t *testing.T) {
		code, out := undo(tokStaff, concert, ticket)
		if code != 409 {
			t.Fatalf("status %d (%v), want 409", code, out)
		}
	})

	t.Run("staff undoes a check-in; the ticket can be scanned again", func(t *testing.T) {
		if r := scan(tokStaff); r != "valid" {
			t.Fatalf("scan = %v", r)
		}
		if r := scan(tokStaff); r != "already_used" {
			t.Fatalf("second scan = %v", r)
		}
		code, out := undo(tokStaff, concert, ticket)
		m, _ := out.(map[string]any)
		if code != 200 || m["ticket_id"] != ticket || m["status"] != "valid" {
			t.Fatalf("undo: %d %v", code, out)
		}
		if status, at, by := dbState(); status != "valid" || at != nil || by != nil {
			t.Fatalf("ticket after undo: %q, checked_in_at %v, checked_in_by %v", status, at, by)
		}
		if code, _ := undo(tokStaff, concert, ticket); code != 409 {
			t.Errorf("second undo: %d, want 409", code)
		}
		if r := scan(tokStaff); r != "valid" {
			t.Fatalf("scan after undo = %v, want valid", r)
		}
	})

	t.Run("the organizer can undo too, then the ticket is checked in once more", func(t *testing.T) {
		if code, out := undo(tokOrg, concert, ticket); code != 200 {
			t.Fatalf("organizer undo: %d %v", code, out)
		}
		if r := scan(tokOrg); r != "valid" {
			t.Fatalf("scan = %v", r)
		}
		if status, at, by := dbState(); status != "checked_in" || at == nil || by == nil {
			t.Fatalf("ticket: %q %v %v", status, at, by)
		}
	})

	t.Run("history shows every check-in and every undo, oldest first", func(t *testing.T) {
		hist := c.must(200, tokOrg, "GET", "/api/organizer/events/"+concert+"/history", nil)
		var got []string
		activity := hist["activity"].([]any)
		for i := len(activity) - 1; i >= 0; i-- {
			a := activity[i].(map[string]any)
			if a["type"] == "checkin" {
				got = append(got, fmt.Sprintf("%s [%s]", a["message"], a["actor"]))
			}
		}
		want := []string{
			"Checked in: Holder (General) [Staff]",
			"Check-in undone: Holder (General) [Staff]",
			"Checked in: Holder (General) [Staff]",
			"Check-in undone: Holder (General) [OrgA]",
			"Checked in: Holder (General) [OrgA]",
		}
		if strings.Join(got, "\n") != strings.Join(want, "\n") {
			t.Fatalf("check-in timeline:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
		}
	})

	t.Run("the lecture's history is untouched", func(t *testing.T) {
		hist := c.must(200, tokOrg, "GET", "/api/organizer/events/"+lecture+"/history", nil)
		for _, x := range hist["activity"].([]any) {
			if x.(map[string]any)["type"] == "checkin" {
				t.Fatalf("unexpected check-in entry: %v", x)
			}
		}
	})
}
