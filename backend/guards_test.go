package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRouteGuards(t *testing.T) {
	s := newTestServer()
	mux := s.routes()
	const ev = sampleEventID
	organizer := []struct{ method, path string }{
		{"PUT", "/api/events/" + ev},
		{"PUT", "/api/events/" + ev + "/ticket-types/" + sampleTicketTypeID},
		{"DELETE", "/api/events/" + ev + "/ticket-types/" + sampleTicketTypeID},
		{"POST", "/api/organizer/events/" + ev + "/cancel"},
		{"GET", "/api/organizer/events/" + ev + "/attendees"},
		{"GET", "/api/organizer/events/" + ev + "/activation"},
		{"POST", "/api/organizer/events/" + ev + "/activation/identity"},
		{"GET", "/api/organizer/events/" + ev + "/analytics"},
		{"GET", "/api/organizer/events/" + ev + "/history"},
		{"GET", "/api/organizer/events/" + ev + "/orders"},
		{"GET", "/api/organizer/events/" + ev + "/refund-policy"},
		{"PUT", "/api/organizer/events/" + ev + "/refund-policy"},
		{"POST", "/api/organizer/orders/" + ev + "/cancel"},
		{"POST", "/api/organizer/orders/" + ev + "/refund"},
		{"GET", "/api/organizer/profile"},
		{"PUT", "/api/organizer/profile"},
		{"GET", "/api/organizer/campaigns"},
		{"POST", "/api/organizer/campaigns"},
		{"PATCH", "/api/organizer/campaigns/" + ev},
		{"GET", "/api/organizer/support/cases"},
		{"GET", "/api/organizer/support/cases/1"},
		{"PATCH", "/api/organizer/support/cases/1"},
		{"POST", "/api/organizer/support/cases/1/messages"},
	}
	admin := []struct{ method, path string }{
		{"GET", "/api/admin/users"},
		{"GET", "/api/admin/events"},
		{"GET", "/api/admin/stats"},
		{"GET", "/api/admin/audit"},
		{"POST", "/api/admin/users/" + ev + "/suspend"},
		{"POST", "/api/admin/events/" + ev + "/stop-sales"},
		{"GET", "/api/admin/support/cases"},
		{"PATCH", "/api/admin/support/cases/1"},
	}
	loggedIn := []struct{ method, path string }{
		{"POST", "/api/orders/checkout"},
		{"GET", "/api/my-orders"},
		{"POST", "/api/promo/validate"},
		{"POST", "/api/events/" + ev + "/report"},
		{"GET", "/api/support/cases"},
		{"POST", "/api/support/cases"},
		{"POST", "/api/auth/resend-verification"},
	}
	check := func(role, method, path string, want int) {
		t.Helper()
		rec := httptest.NewRecorder()
		var req *http.Request
		if role == "" {
			req = jsonRequest(method, path, `{}`)
		} else {
			req = authedRequest(t, s, role, method, path, `{}`)
		}
		mux.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("%s %s as %q: status = %d, want %d", method, path, role, rec.Code, want)
		}
		errorOf(t, rec)
	}
	for _, r := range append(append(organizer, admin...), loggedIn...) {
		check("", r.method, r.path, http.StatusUnauthorized)
	}
	for _, r := range organizer {
		for _, role := range []string{"attendee", "event_admin", "platform_admin"} {
			check(role, r.method, r.path, http.StatusForbidden)
		}
	}
	for _, r := range admin {
		for _, role := range []string{"attendee", "organizer", "event_admin"} {
			check(role, r.method, r.path, http.StatusForbidden)
		}
	}
}

func TestDiscountFor(t *testing.T) {
	cases := []struct {
		kind           string
		amount, sub, d int
	}{
		{"percent", 20, 6000, 1200},
		{"percent", 15, 999, 150},
		{"percent", 100, 3000, 3000},
		{"fixed", 500, 3000, 500},
		{"fixed", 5000, 3000, 3000},
		{"fixed", 500, 0, 0},
	}
	for _, c := range cases {
		got := discountFor(campaign{DiscountType: c.kind, Amount: c.amount}, c.sub)
		if got != c.d {
			t.Errorf("%s %d on %d = %d, want %d", c.kind, c.amount, c.sub, got, c.d)
		}
	}
}

func TestFlexTime(t *testing.T) {
	for in, want := range map[string]string{
		`"2026-12-01"`:                "2026-12-01T00:00:00+05:00",
		`"2026-12-01T19:30"`:          "2026-12-01T19:30:00+05:00",
		`"2026-12-01T19:30:00"`:       "2026-12-01T19:30:00+05:00",
		`"2026-12-01T19:30:00+06:00"`: "2026-12-01T19:30:00+06:00",
		`"2026-12-01T14:30:00Z"`:      "2026-12-01T14:30:00Z",
	} {
		var f flexTime
		if err := f.UnmarshalJSON([]byte(in)); err != nil || !f.Set {
			t.Errorf("%s: err %v set %v", in, err, f.Set)
			continue
		}
		if got := f.Format("2006-01-02T15:04:05Z07:00"); got != want {
			t.Errorf("%s = %s, want %s", in, got, want)
		}
	}
	for _, in := range []string{`null`, `""`} {
		var f flexTime
		if err := f.UnmarshalJSON([]byte(in)); err != nil || f.Set {
			t.Errorf("%s: err %v set %v", in, err, f.Set)
		}
	}
	var f flexTime
	if err := f.UnmarshalJSON([]byte(`"next tuesday"`)); err == nil {
		t.Error("bad time accepted")
	}
}
