package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var testJWTSecret = []byte("test-secret-test-secret-test-secret-0123")

func newTestServer() *Server {
	return &Server{cfg: Config{JWTSecret: testJWTSecret}}
}

func newDBTestServer(t *testing.T) *Server {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping database test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	if err := migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return &Server{db: pool, cfg: Config{JWTSecret: testJWTSecret}}
}

func jsonRequest(method, path, body string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func errorOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("error body is not JSON: %q", rec.Body.String())
	}
	if len(body) != 1 || body["error"] == "" {
		t.Fatalf(`error body must be {"error": "message"}, got %q`, rec.Body.String())
	}
	return body["error"]
}

func mustToken(t *testing.T, s *Server, id, role string) string {
	t.Helper()
	tok, err := s.issueToken(User{ID: id, Role: role})
	if err != nil {
		t.Fatalf("issueToken: %v", err)
	}
	return tok
}

func TestSignupValidation(t *testing.T) {
	s := newTestServer()
	long := strings.Repeat("a", 101)
	cases := []struct {
		name string
		body string
	}{
		{"malformed json", `{"email":`},
		{"unknown field", `{"email":"a@b.kz","password":"password1","full_name":"A","fullName":"A"}`},
		{"camelCase key is not accepted", `{"email":"a@b.kz","password":"password1","fullName":"A"}`},
		{"bad email", `{"email":"not-an-email","password":"password1","full_name":"Aigerim"}`},
		{"empty email", `{"email":"","password":"password1","full_name":"Aigerim"}`},
		{"empty name", `{"email":"a@b.kz","password":"password1","full_name":"   "}`},
		{"name too long", `{"email":"a@b.kz","password":"password1","full_name":"` + long + `"}`},
		{"password too short", `{"email":"a@b.kz","password":"short","full_name":"Aigerim"}`},
		{"password over bcrypt limit", `{"email":"a@b.kz","password":"` + strings.Repeat("x", 73) + `","full_name":"Aigerim"}`},
		{"unknown role", `{"email":"a@b.kz","password":"password1","full_name":"Aigerim","role":"superuser"}`},
		{"cannot self-assign event_admin", `{"email":"a@b.kz","password":"password1","full_name":"Aigerim","role":"event_admin"}`},
		{"cannot self-assign platform_admin", `{"email":"a@b.kz","password":"password1","full_name":"Aigerim","role":"platform_admin"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			s.handleSignup(rec, jsonRequest("POST", "/api/auth/signup", tc.body))
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body.String())
			}
			errorOf(t, rec)
		})
	}
}

func TestLoginRejectsMalformedBody(t *testing.T) {
	s := newTestServer()
	for _, body := range []string{``, `{"email":`, `{"email":"a@b.kz","password":"x","extra":1}`} {
		rec := httptest.NewRecorder()
		s.handleLogin(rec, jsonRequest("POST", "/api/auth/login", body))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %q: status = %d, want 400", body, rec.Code)
		}
		errorOf(t, rec)
	}
}

func TestIssueToken(t *testing.T) {
	s := newTestServer()
	before := time.Now().Add(-time.Second)
	raw := mustToken(t, s, "user-1", "organizer")

	claims := &Claims{}
	tok, err := jwt.ParseWithClaims(raw, claims, func(*jwt.Token) (any, error) { return testJWTSecret, nil },
		jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !tok.Valid {
		t.Fatalf("token does not verify: %v", err)
	}
	if claims.Subject != "user-1" || claims.Role != "organizer" {
		t.Errorf("claims = sub %q role %q", claims.Subject, claims.Role)
	}
	exp := claims.ExpiresAt.Time
	if exp.Before(before.Add(tokenTTL-time.Minute)) || exp.After(time.Now().Add(tokenTTL+time.Minute)) {
		t.Errorf("expiry %v is not about %v from now", exp, tokenTTL)
	}
}

func TestRequireAuth(t *testing.T) {
	s := newTestServer()
	var gotSubject, gotRole string
	h := s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := claimsFrom(r.Context())
		gotSubject, gotRole = c.Subject, c.Role
		w.WriteHeader(http.StatusNoContent)
	}))

	sign := func(method jwt.SigningMethod, secret any, exp time.Time) string {
		raw, err := jwt.NewWithClaims(method, Claims{
			Role:             "attendee",
			RegisteredClaims: jwt.RegisteredClaims{Subject: "u1", ExpiresAt: jwt.NewNumericDate(exp)},
		}).SignedString(secret)
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}

	cases := []struct {
		name   string
		header string
		want   int
	}{
		{"no header", "", http.StatusUnauthorized},
		{"wrong scheme", "Basic abc", http.StatusUnauthorized},
		{"empty bearer", "Bearer ", http.StatusUnauthorized},
		{"garbage token", "Bearer not.a.jwt", http.StatusUnauthorized},
		{"expired token", "Bearer " + sign(jwt.SigningMethodHS256, testJWTSecret, time.Now().Add(-time.Hour)), http.StatusUnauthorized},
		{"signed with another secret", "Bearer " + sign(jwt.SigningMethodHS256, []byte("another-secret-another-secret-12345"), time.Now().Add(time.Hour)), http.StatusUnauthorized},
		{"other HMAC algorithm", "Bearer " + sign(jwt.SigningMethodHS512, testJWTSecret, time.Now().Add(time.Hour)), http.StatusUnauthorized},
		{"alg none", "Bearer " + sign(jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, time.Now().Add(time.Hour)), http.StatusUnauthorized},
		{"valid token", "Bearer " + sign(jwt.SigningMethodHS256, testJWTSecret, time.Now().Add(time.Hour)), http.StatusNoContent},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/me", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d", rec.Code, tc.want)
			}
			if tc.want == http.StatusUnauthorized {
				errorOf(t, rec)
			}
		})
	}
	if gotSubject != "u1" || gotRole != "attendee" {
		t.Errorf("handler saw sub %q role %q, want u1 / attendee", gotSubject, gotRole)
	}
}

func TestRequireRole(t *testing.T) {
	s := newTestServer()
	h := s.requireAuth(s.requireRole("organizer", "event_admin")(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })))

	for role, want := range map[string]int{
		"organizer":      http.StatusNoContent,
		"event_admin":    http.StatusNoContent,
		"attendee":       http.StatusForbidden,
		"platform_admin": http.StatusForbidden,
	} {
		req := httptest.NewRequest("GET", "/x", nil)
		req.Header.Set("Authorization", "Bearer "+mustToken(t, s, "u1", role))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("role %q: status = %d, want %d", role, rec.Code, want)
		}
		if want == http.StatusForbidden {
			errorOf(t, rec)
		}
	}
}

func TestSignupLoginMe_DB(t *testing.T) {
	s := newDBTestServer(t)

	stamp := time.Now().UnixNano()
	email := fmt.Sprintf("attendee-%d@test.biletflow.local", stamp)
	orgEmail := fmt.Sprintf("organizer-%d@test.biletflow.local", stamp)
	t.Cleanup(func() {
		_, _ = s.db.Exec(context.Background(),
			`DELETE FROM users WHERE email IN ($1, $2)`, email, orgEmail)
	})
	const password = "correct horse battery"

	signup := func(body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		s.handleSignup(rec, jsonRequest("POST", "/api/auth/signup", body))
		return rec
	}
	login := func(email, pw string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		body, _ := json.Marshal(map[string]string{"email": email, "password": pw})
		s.handleLogin(rec, jsonRequest("POST", "/api/auth/login", string(body)))
		return rec
	}

	var attendeeToken string

	t.Run("signup defaults to attendee", func(t *testing.T) {
		rec := signup(fmt.Sprintf(`{"email":%q,"password":%q,"full_name":"Aigerim S."}`, email, password))
		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201 (%s)", rec.Code, rec.Body.String())
		}
		var resp authResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if resp.Token == "" || resp.User.ID == "" {
			t.Fatalf("missing token or user id: %s", rec.Body.String())
		}
		if resp.User.Role != "attendee" || resp.User.Email != email || resp.User.FullName != "Aigerim S." {
			t.Errorf("unexpected user: %+v", resp.User)
		}
		if strings.Contains(strings.ToLower(rec.Body.String()), "password") {
			t.Errorf("response must not mention the password or its hash: %s", rec.Body.String())
		}
		attendeeToken = resp.Token
	})

	t.Run("signup as organizer", func(t *testing.T) {
		rec := signup(fmt.Sprintf(`{"email":%q,"password":%q,"full_name":"Org","role":"organizer"}`, orgEmail, password))
		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201 (%s)", rec.Code, rec.Body.String())
		}
		var resp authResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.User.Role != "organizer" {
			t.Errorf("role = %q, want organizer", resp.User.Role)
		}
	})

	t.Run("duplicate email is 409, case and spaces ignored", func(t *testing.T) {
		rec := signup(fmt.Sprintf(`{"email":"  %s  ","password":%q,"full_name":"Copy"}`, strings.ToUpper(email), password))
		if rec.Code != http.StatusConflict {
			t.Fatalf("status = %d, want 409 (%s)", rec.Code, rec.Body.String())
		}
		errorOf(t, rec)
	})

	t.Run("login ok", func(t *testing.T) {
		for _, e := range []string{email, "  " + strings.ToUpper(email) + " "} {
			rec := login(e, password)
			if rec.Code != http.StatusOK {
				t.Fatalf("login %q: status = %d, want 200 (%s)", e, rec.Code, rec.Body.String())
			}
			var resp authResponse
			_ = json.Unmarshal(rec.Body.Bytes(), &resp)
			if resp.Token == "" || resp.User.Email != email {
				t.Errorf("login %q: bad response %s", e, rec.Body.String())
			}
		}
	})

	t.Run("wrong password and unknown email look the same", func(t *testing.T) {
		wrong := login(email, "definitely-wrong")
		unknown := login(fmt.Sprintf("nobody-%d@test.biletflow.local", stamp), password)
		if wrong.Code != http.StatusUnauthorized || unknown.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d / %d, want 401 / 401", wrong.Code, unknown.Code)
		}
		if errorOf(t, wrong) != errorOf(t, unknown) {
			t.Errorf("error messages differ, which lets an attacker list registered emails")
		}
	})

	t.Run("GET /api/me with the signup token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/me", nil)
		req.Header.Set("Authorization", "Bearer "+attendeeToken)
		rec := httptest.NewRecorder()
		s.requireAuth(http.HandlerFunc(s.handleMe)).ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200 (%s)", rec.Code, rec.Body.String())
		}
		var u User
		_ = json.Unmarshal(rec.Body.Bytes(), &u)
		if u.Email != email {
			t.Errorf("email = %q, want %q", u.Email, email)
		}
	})
}
