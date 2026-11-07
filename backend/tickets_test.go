package main

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

const (
	sampleEventID      = "11111111-1111-1111-1111-111111111111"
	sampleTicketTypeID = "22222222-2222-2222-2222-222222222222"
)

func ticketMux(s *Server) *http.ServeMux {
	mux := http.NewServeMux()
	s.registerTicketRoutes(mux)
	return mux
}

func authedRequest(t *testing.T, s *Server, role, method, path, body string) *http.Request {
	t.Helper()
	req := jsonRequest(method, path, body)
	req.Header.Set("Authorization", "Bearer "+mustToken(t, s, "33333333-3333-3333-3333-333333333333", role))
	return req
}

func TestNewQRCode(t *testing.T) {
	seen := make(map[string]bool)
	urlSafe := regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	for i := 0; i < 2000; i++ {
		qr, err := newQRCode()
		if err != nil {
			t.Fatal(err)
		}
		if len(qr) != 43 {
			t.Fatalf("qr length = %d, want 43", len(qr))
		}
		if !urlSafe.MatchString(qr) {
			t.Fatalf("qr %q is not URL-safe", qr)
		}
		if seen[qr] {
			t.Fatalf("duplicate qr code %q", qr)
		}
		seen[qr] = true
	}
}

func TestTicketRoutesRequireAuth(t *testing.T) {
	s := newTestServer()
	mux := ticketMux(s)
	for _, tc := range []struct{ method, path string }{
		{"POST", "/api/events/" + sampleEventID + "/register"},
		{"GET", "/api/my-tickets"},
		{"POST", "/api/checkin"},
	} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, jsonRequest(tc.method, tc.path, `{}`))
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without token: status = %d, want 401", tc.method, tc.path, rec.Code)
		}
		errorOf(t, rec)
	}
}

func TestCheckinRoleGuard(t *testing.T) {
	s := newTestServer()
	mux := ticketMux(s)
	for _, role := range []string{"attendee", "platform_admin"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, authedRequest(t, s, role, "POST", "/api/checkin", `{"qr_code":"abc"}`))
		if rec.Code != http.StatusForbidden {
			t.Errorf("role %q: status = %d, want 403", role, rec.Code)
		}
		errorOf(t, rec)
	}
}

func TestCheckinValidation(t *testing.T) {
	s := newTestServer()
	mux := ticketMux(s)
	for _, role := range []string{"event_admin", "organizer"} {
		for name, body := range map[string]string{
			"malformed json": `{"qr_code":`,
			"missing qr":     `{}`,
			"blank qr":       `{"qr_code":"   "}`,
			"unknown field":  `{"qr_code":"abc","qrCode":"abc"}`,
		} {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, authedRequest(t, s, role, "POST", "/api/checkin", body))
			if rec.Code != http.StatusBadRequest {
				t.Errorf("%s/%s: status = %d, want 400", role, name, rec.Code)
			}
			errorOf(t, rec)
		}
	}
}

func TestCheckinOversizedCodeIsInvalid(t *testing.T) {
	s := newTestServer()
	body := `{"qr_code":"` + strings.Repeat("x", maxQRCodeLen+1) + `"}`
	rec := httptest.NewRecorder()
	ticketMux(s).ServeHTTP(rec, authedRequest(t, s, "event_admin", "POST", "/api/checkin", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"result":"invalid","ticket":null}` {
		t.Errorf("body = %s", got)
	}
}

func TestRegisterValidation(t *testing.T) {
	s := newTestServer()
	mux := ticketMux(s)

	cases := []struct {
		name string
		path string
		body string
		want int
	}{
		{"event id is not a uuid", "/api/events/42/register", `{"ticket_type_id":"` + sampleTicketTypeID + `","quantity":1}`, http.StatusNotFound},
		{"malformed json", "/api/events/" + sampleEventID + "/register", `{"ticket_type_id":`, http.StatusBadRequest},
		{"missing ticket_type_id", "/api/events/" + sampleEventID + "/register", `{"quantity":1}`, http.StatusBadRequest},
		{"ticket_type_id not a uuid", "/api/events/" + sampleEventID + "/register", `{"ticket_type_id":"abc","quantity":1}`, http.StatusBadRequest},
		{"missing quantity", "/api/events/" + sampleEventID + "/register", `{"ticket_type_id":"` + sampleTicketTypeID + `"}`, http.StatusBadRequest},
		{"zero quantity", "/api/events/" + sampleEventID + "/register", `{"ticket_type_id":"` + sampleTicketTypeID + `","quantity":0}`, http.StatusBadRequest},
		{"negative quantity", "/api/events/" + sampleEventID + "/register", `{"ticket_type_id":"` + sampleTicketTypeID + `","quantity":-3}`, http.StatusBadRequest},
		{"quantity over the per-order limit", "/api/events/" + sampleEventID + "/register", `{"ticket_type_id":"` + sampleTicketTypeID + `","quantity":11}`, http.StatusBadRequest},
		{"quantity is not an integer", "/api/events/" + sampleEventID + "/register", `{"ticket_type_id":"` + sampleTicketTypeID + `","quantity":1.5}`, http.StatusBadRequest},
		{"camelCase key is not accepted", "/api/events/" + sampleEventID + "/register", `{"ticketTypeId":"` + sampleTicketTypeID + `","quantity":1}`, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, authedRequest(t, s, "attendee", "POST", tc.path, tc.body))
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tc.want, rec.Body.String())
			}
			errorOf(t, rec)
		})
	}
}
