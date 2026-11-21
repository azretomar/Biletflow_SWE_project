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

func organizerMux(s *Server) *http.ServeMux {
	mux := http.NewServeMux()
	s.registerOrganizerRoutes(mux)
	return mux
}

func TestOrganizerEventsGuards(t *testing.T) {
	s := newTestServer()
	mux := organizerMux(s)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, jsonRequest("GET", "/api/organizer/events", ""))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("without token: status = %d, want 401", rec.Code)
	}
	errorOf(t, rec)

	for _, role := range []string{"attendee", "event_admin", "platform_admin"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, authedRequest(t, s, role, "GET", "/api/organizer/events", ""))
		if rec.Code != http.StatusForbidden {
			t.Errorf("as %s: status = %d, want 403", role, rec.Code)
		}
		errorOf(t, rec)
	}
}

func TestOrganizerEventsDB(t *testing.T) {
	s := newDBTestServer(t)
	mux := organizerMux(s)
	ctx := context.Background()

	stamp := time.Now().UnixNano()
	newOrganizer := func(name string) string {
		var id string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, full_name, role)
			VALUES ($1, 'x', $2, 'organizer') RETURNING id`,
			fmt.Sprintf("%s-%d@test.biletflow.local", name, stamp), name,
		).Scan(&id); err != nil {
			t.Fatalf("create user %s: %v", name, err)
		}
		return id
	}
	newEvent := func(organizerID, title, when string) string {
		var id string
		if err := s.db.QueryRow(ctx, `
			INSERT INTO events (organizer_id, title, date, venue, capacity)
			VALUES ($1, $2, now() + $3::interval, 'Test Hall', 100) RETURNING id`,
			organizerID, title, when,
		).Scan(&id); err != nil {
			t.Fatalf("create event: %v", err)
		}
		return id
	}

	me := newOrganizer("org-me")
	other := newOrganizer("org-other")
	later := newEvent(me, "Later", "14 days")
	sooner := newEvent(me, "Sooner", "2 days")
	newEvent(other, "Not mine", "1 day")
	if _, err := s.db.Exec(ctx, `
		INSERT INTO ticket_types (event_id, name, price, quantity, quantity_left)
		VALUES ($1, 'Free', 0, 10, 7), ($1, 'VIP', 5000, 5, 4)`, sooner); err != nil {
		t.Fatalf("create ticket types: %v", err)
	}

	req := jsonRequest("GET", "/api/organizer/events", "")
	req.Header.Set("Authorization", "Bearer "+mustToken(t, s, me, "organizer"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var got []organizerEvent
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d events, want 2 (only the organizer's own): %+v", len(got), got)
	}
	if got[0].ID != sooner || got[1].ID != later {
		t.Errorf("order = %s, %s; want soonest first", got[0].Title, got[1].Title)
	}
	if got[0].Sold != 4 || got[0].TotalQty != 15 || got[0].TicketTypes != 2 || got[0].MinPrice != 0 {
		t.Errorf("sooner stats = sold %d, total %d, types %d, min %d; want 4, 15, 2, 0",
			got[0].Sold, got[0].TotalQty, got[0].TicketTypes, got[0].MinPrice)
	}
	if got[1].Sold != 0 || got[1].TicketTypes != 0 {
		t.Errorf("later stats = sold %d, types %d; want 0, 0", got[1].Sold, got[1].TicketTypes)
	}
}
