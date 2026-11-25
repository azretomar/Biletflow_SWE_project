package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func staffMux(s *Server) *http.ServeMux {
	mux := http.NewServeMux()
	s.registerTicketRoutes(mux)
	s.registerStaffRoutes(mux)
	return mux
}

func TestStaffRoutesRequireAuth(t *testing.T) {
	s := newTestServer()
	mux := staffMux(s)
	for _, tc := range []struct{ method, path string }{
		{"GET", "/api/events/" + sampleEventID + "/staff"},
		{"POST", "/api/events/" + sampleEventID + "/staff"},
		{"DELETE", "/api/events/" + sampleEventID + "/staff/" + sampleTicketTypeID},
		{"GET", "/api/staff/events"},
	} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, jsonRequest(tc.method, tc.path, `{}`))
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without token: status = %d, want 401", tc.method, tc.path, rec.Code)
		}
		errorOf(t, rec)
	}
}

func TestStaffRoleGuards(t *testing.T) {
	s := newTestServer()
	mux := staffMux(s)
	organizerRoutes := []struct{ method, path string }{
		{"GET", "/api/events/" + sampleEventID + "/staff"},
		{"POST", "/api/events/" + sampleEventID + "/staff"},
		{"DELETE", "/api/events/" + sampleEventID + "/staff/" + sampleTicketTypeID},
	}
	for _, role := range []string{"attendee", "event_admin", "platform_admin"} {
		for _, tc := range organizerRoutes {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, authedRequest(t, s, role, tc.method, tc.path, `{"email":"a@b.kz"}`))
			if rec.Code != http.StatusForbidden {
				t.Errorf("%s %s as %s: status = %d, want 403", tc.method, tc.path, role, rec.Code)
			}
			errorOf(t, rec)
		}
	}
	for _, role := range []string{"attendee", "platform_admin"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, authedRequest(t, s, role, "GET", "/api/staff/events", ""))
		if rec.Code != http.StatusForbidden {
			t.Errorf("GET /api/staff/events as %s: status = %d, want 403", role, rec.Code)
		}
		errorOf(t, rec)
	}
}

func TestAssignStaffValidation(t *testing.T) {
	s := newTestServer()
	mux := staffMux(s)
	for name, tc := range map[string]struct {
		path, body string
		want       int
	}{
		"malformed json":   {"/api/events/" + sampleEventID + "/staff", `{"email":`, http.StatusBadRequest},
		"missing email":    {"/api/events/" + sampleEventID + "/staff", `{}`, http.StatusBadRequest},
		"invalid email":    {"/api/events/" + sampleEventID + "/staff", `{"email":"not-an-email"}`, http.StatusBadRequest},
		"unknown field":    {"/api/events/" + sampleEventID + "/staff", `{"email":"a@b.kz","role":"x"}`, http.StatusBadRequest},
		"event not a uuid": {"/api/events/42/staff", `{"email":"a@b.kz"}`, http.StatusNotFound},
	} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, authedRequest(t, s, "organizer", "POST", tc.path, tc.body))
		if rec.Code != tc.want {
			t.Errorf("%s: status = %d, want %d (%s)", name, rec.Code, tc.want, rec.Body.String())
		}
		errorOf(t, rec)
	}
}

// End-to-end staff assignment and event-scoped check-in against a real database.
func TestStaffAssignmentAndCheckinDB(t *testing.T) {
	s := newDBTestServer(t)
	mux := staffMux(s)
	ctx := context.Background()

	stamp := time.Now().UnixNano()
	email := func(name string) string { return fmt.Sprintf("%s-%d@test.biletflow.local", name, stamp) }
	newUser := func(name, role string) string {
		var id string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, full_name, role)
			VALUES ($1, 'x', $2, $3) RETURNING id`, email(name), name, role,
		).Scan(&id); err != nil {
			t.Fatalf("create user %s: %v", name, err)
		}
		return id
	}
	newEvent := func(organizerID, title string) string {
		var id string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO events (organizer_id, title, date, venue, capacity)
			VALUES ($1, $2, now() + interval '7 days', 'Test Hall', 100) RETURNING id`,
			organizerID, title,
		).Scan(&id); err != nil {
			t.Fatalf("create event: %v", err)
		}
		return id
	}
	newTicket := func(eventID, userID string) string {
		var ttID, orderID string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO ticket_types (event_id, name, price, quantity, quantity_left)
			VALUES ($1, 'General', 0, 10, 9) RETURNING id`, eventID).Scan(&ttID); err != nil {
			t.Fatalf("create ticket type: %v", err)
		}
		if err := s.db.QueryRow(ctx, `
			INSERT INTO orders (user_id, event_id) VALUES ($1, $2) RETURNING id`,
			userID, eventID).Scan(&orderID); err != nil {
			t.Fatalf("create order: %v", err)
		}
		qr, err := newQRCode()
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.db.Exec(ctx, `
			INSERT INTO tickets (order_id, event_id, ticket_type_id, user_id, qr_code)
			VALUES ($1, $2, $3, $4, $5)`, orderID, eventID, ttID, userID, qr); err != nil {
			t.Fatalf("create ticket: %v", err)
		}
		return qr
	}

	orgA := newUser("org-a", "organizer")
	orgB := newUser("org-b", "organizer")
	staff := newUser("staff", "attendee")
	holder := newUser("holder", "attendee")
	t.Cleanup(func() {
		ids := []string{orgA, orgB, staff, holder}
		_, _ = s.db.Exec(ctx, `DELETE FROM tickets WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM orders WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM events WHERE organizer_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, ids)
	})

	concert := newEvent(orgA, "Concert")
	lecture := newEvent(orgA, "Lecture")
	concertQR := newTicket(concert, holder)
	lectureQR := newTicket(lecture, holder)

	call := func(userID, role, method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := jsonRequest(method, path, body)
		req.Header.Set("Authorization", "Bearer "+mustToken(t, s, userID, role))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}
	want := func(rec *httptest.ResponseRecorder, code int) {
		t.Helper()
		if rec.Code != code {
			t.Fatalf("status = %d, want %d (%s)", rec.Code, code, rec.Body.String())
		}
	}
	checkin := func(userID, role, eventID, qr string) *httptest.ResponseRecorder {
		t.Helper()
		return call(userID, role, "POST", "/api/checkin",
			fmt.Sprintf(`{"event_id":%q,"qr_code":%q}`, eventID, qr))
	}
	result := func(rec *httptest.ResponseRecorder) checkinResponse {
		t.Helper()
		want(rec, http.StatusOK)
		var resp checkinResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return resp
	}
	assignBody := fmt.Sprintf(`{"email":%q}`, email("staff"))

	t.Run("unassigned event_admin cannot check in", func(t *testing.T) {
		want(checkin(staff, "event_admin", concert, concertQR), http.StatusForbidden)
	})

	t.Run("another organizer cannot assign staff", func(t *testing.T) {
		want(call(orgB, "organizer", "POST", "/api/events/"+concert+"/staff", assignBody), http.StatusForbidden)
	})

	t.Run("owner assigns staff and attendee becomes event_admin", func(t *testing.T) {
		rec := call(orgA, "organizer", "POST", "/api/events/"+concert+"/staff", assignBody)
		want(rec, http.StatusCreated)
		var m staffMember
		if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil || m.UserID != staff {
			t.Fatalf("response = %s", rec.Body.String())
		}
		var role string
		if err := s.db.QueryRow(ctx, `SELECT role FROM users WHERE id = $1`, staff).Scan(&role); err != nil || role != "event_admin" {
			t.Fatalf("role = %q (%v), want event_admin", role, err)
		}
	})

	t.Run("assign errors", func(t *testing.T) {
		want(call(orgA, "organizer", "POST", "/api/events/"+concert+"/staff", assignBody), http.StatusConflict)
		want(call(orgA, "organizer", "POST", "/api/events/"+concert+"/staff",
			fmt.Sprintf(`{"email":%q}`, email("nobody"))), http.StatusNotFound)
		want(call(orgA, "organizer", "POST", "/api/events/"+concert+"/staff",
			fmt.Sprintf(`{"email":%q}`, email("org-a"))), http.StatusBadRequest)
	})

	t.Run("owner lists staff", func(t *testing.T) {
		rec := call(orgA, "organizer", "GET", "/api/events/"+concert+"/staff", "")
		want(rec, http.StatusOK)
		var list []staffMember
		if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list) != 1 || list[0].UserID != staff {
			t.Fatalf("list = %s", rec.Body.String())
		}
		want(call(orgB, "organizer", "GET", "/api/events/"+concert+"/staff", ""), http.StatusForbidden)
	})

	t.Run("staff events lists only assigned and own events", func(t *testing.T) {
		rec := call(staff, "event_admin", "GET", "/api/staff/events", "")
		want(rec, http.StatusOK)
		var list []staffEvent
		if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list) != 1 ||
			list[0].ID != concert || list[0].Access != "staff" {
			t.Fatalf("staff events = %s", rec.Body.String())
		}
		rec = call(orgA, "organizer", "GET", "/api/staff/events", "")
		want(rec, http.StatusOK)
		if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list) != 2 || list[0].Access != "organizer" {
			t.Fatalf("organizer events = %s", rec.Body.String())
		}
	})

	t.Run("assigned staff checks in once", func(t *testing.T) {
		if r := result(checkin(staff, "event_admin", concert, concertQR)); r.Result != "valid" || r.Ticket == nil {
			t.Fatalf("first scan = %+v", r)
		}
		if r := result(checkin(staff, "event_admin", concert, concertQR)); r.Result != "already_used" {
			t.Fatalf("second scan = %+v", r)
		}
	})

	t.Run("ticket for another event is invalid and not consumed", func(t *testing.T) {
		r := result(checkin(staff, "event_admin", concert, lectureQR))
		if r.Result != "invalid" || r.Ticket != nil {
			t.Fatalf("wrong-event scan = %+v", r)
		}
		var status string
		if err := s.db.QueryRow(ctx, `SELECT status FROM tickets WHERE qr_code = $1`, lectureQR).Scan(&status); err != nil || status != "valid" {
			t.Fatalf("lecture ticket status = %q (%v), want valid", status, err)
		}
	})

	t.Run("staff cannot check in at events they are not assigned to", func(t *testing.T) {
		want(checkin(staff, "event_admin", lecture, lectureQR), http.StatusForbidden)
		want(checkin(staff, "event_admin", sampleEventID, lectureQR), http.StatusNotFound)
	})

	t.Run("organizer checks in at own event", func(t *testing.T) {
		if r := result(checkin(orgA, "organizer", lecture, lectureQR)); r.Result != "valid" {
			t.Fatalf("organizer scan = %+v", r)
		}
		want(checkin(orgB, "organizer", lecture, lectureQR), http.StatusForbidden)
	})

	t.Run("removed staff loses access", func(t *testing.T) {
		path := "/api/events/" + concert + "/staff/" + staff
		want(call(orgB, "organizer", "DELETE", path, ""), http.StatusForbidden)
		want(call(orgA, "organizer", "DELETE", path, ""), http.StatusNoContent)
		want(call(orgA, "organizer", "DELETE", path, ""), http.StatusNotFound)
		want(checkin(staff, "event_admin", concert, concertQR), http.StatusForbidden)
	})
}

// Entrance counter and manual search for staff (GET /api/staff/events/{id}/attendees).
func TestStaffAttendeesDB(t *testing.T) {
	s := newDBTestServer(t)
	mux := staffMux(s)
	ctx := context.Background()
	stamp := time.Now().UnixNano()

	newUser := func(name, role string) string {
		var id string
		if err := s.db.QueryRow(ctx, `INSERT INTO users (email, password_hash, full_name, role)
			VALUES ($1, 'x', $2, $3) RETURNING id`, fmt.Sprintf("%s-%d@test.biletflow.local", name, stamp), name, role,
		).Scan(&id); err != nil {
			t.Fatalf("create user: %v", err)
		}
		return id
	}
	org := newUser("org", "organizer")
	staff := newUser("door", "event_admin")
	outsider := newUser("outsider", "event_admin")
	alice := newUser("Alice 100% Fan", "attendee")
	bob := newUser("Bob", "attendee")
	ids := []string{org, staff, outsider, alice, bob}
	t.Cleanup(func() {
		_, _ = s.db.Exec(ctx, `DELETE FROM tickets WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM orders WHERE user_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM events WHERE organizer_id = ANY($1)`, ids)
		_, _ = s.db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, ids)
	})

	var eventID, typeID string
	if err := s.db.QueryRow(ctx, `INSERT INTO events (organizer_id, title, date, venue, capacity)
		VALUES ($1, 'Search Fest', now() + interval '3 days', 'Hall', 50) RETURNING id`, org).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(ctx, `INSERT INTO ticket_types (event_id, name, price, quantity, quantity_left)
		VALUES ($1, 'General', 0, 10, 7) RETURNING id`, eventID).Scan(&typeID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(ctx, `INSERT INTO event_staff (event_id, user_id, assigned_by) VALUES ($1, $2, $3)`, eventID, staff, org); err != nil {
		t.Fatal(err)
	}
	ticket := func(user, status string) {
		var orderID string
		if err := s.db.QueryRow(ctx, `INSERT INTO orders (user_id, event_id) VALUES ($1, $2) RETURNING id`, user, eventID).Scan(&orderID); err != nil {
			t.Fatal(err)
		}
		qr, _ := newQRCode()
		if _, err := s.db.Exec(ctx, `INSERT INTO tickets (order_id, event_id, ticket_type_id, user_id, qr_code, status)
			VALUES ($1, $2, $3, $4, $5, $6)`, orderID, eventID, typeID, user, qr, status); err != nil {
			t.Fatal(err)
		}
	}
	ticket(alice, "valid")
	ticket(bob, "checked_in")
	ticket(bob, "cancelled")

	get := func(user, role, query string) (*httptest.ResponseRecorder, staffAttendeesResponse) {
		t.Helper()
		req := jsonRequest("GET", "/api/staff/events/"+eventID+"/attendees"+query, "")
		req.Header.Set("Authorization", "Bearer "+mustToken(t, s, user, role))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		var resp staffAttendeesResponse
		if rec.Code == http.StatusOK {
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("decode: %v", err)
			}
		}
		return rec, resp
	}

	t.Run("counter without a query", func(t *testing.T) {
		rec, resp := get(staff, "event_admin", "")
		if rec.Code != http.StatusOK || resp.Registered != 2 || resp.CheckedIn != 1 || len(resp.Attendees) != 0 {
			t.Fatalf("status %d, resp %+v", rec.Code, resp)
		}
	})
	t.Run("search by name is case-insensitive and returns the QR code", func(t *testing.T) {
		_, resp := get(staff, "event_admin", "?q=bOb")
		if len(resp.Attendees) != 2 || resp.Attendees[0].QRCode == "" || resp.Attendees[0].FullName != "Bob" {
			t.Fatalf("resp %+v", resp)
		}
	})
	t.Run("LIKE wildcards are literal", func(t *testing.T) {
		_, resp := get(staff, "event_admin", "?q=100%25")
		if len(resp.Attendees) != 1 || resp.Attendees[0].FullName != "Alice 100% Fan" {
			t.Fatalf("resp %+v", resp)
		}
		_, resp = get(staff, "event_admin", "?q=%25")
		if len(resp.Attendees) != 1 {
			t.Fatalf("a bare %% must not match everyone: %+v", resp)
		}
	})
	t.Run("organizer may search, others may not", func(t *testing.T) {
		if rec, _ := get(org, "organizer", "?q=a"); rec.Code != http.StatusOK {
			t.Fatalf("organizer: %d", rec.Code)
		}
		if rec, _ := get(outsider, "event_admin", ""); rec.Code != http.StatusForbidden {
			t.Fatalf("outsider: %d", rec.Code)
		}
		if rec, _ := get(alice, "attendee", ""); rec.Code != http.StatusForbidden {
			t.Fatalf("attendee: %d", rec.Code)
		}
	})
}
