package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// Email verification and password reset (SRS 4.1, 4.10).
// The project has no mail server yet, so "sending" an email writes it to the
// backend log (docker compose logs backend). The links work the same way.
const schemaAccount = `
CREATE TABLE IF NOT EXISTS account_tokens (
	token_hash TEXT PRIMARY KEY,           -- sha256 of the token; the token itself is never stored
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	purpose    TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
	expires_at TIMESTAMPTZ NOT NULL,
	used_at    TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_tokens_user ON account_tokens (user_id, purpose);
`

func init() {
	schemas = append(schemas, schemaAccount)
}

const (
	verifyTokenTTL = 48 * time.Hour
	resetTokenTTL  = 1 * time.Hour
)

func (s *Server) registerAccountRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/auth/verify-email", s.handleVerifyEmail)
	mux.Handle("POST /api/auth/resend-verification", s.requireAuth(http.HandlerFunc(s.handleResendVerification)))
	mux.HandleFunc("POST /api/auth/forgot-password", s.handleForgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", s.handleResetPassword)
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// newAccountToken stores a fresh one-time token and returns it.
func (s *Server) newAccountToken(ctx context.Context, userID, purpose string, ttl time.Duration) (string, error) {
	token, err := newQRCode() // 32 random bytes, URL-safe
	if err != nil {
		return "", err
	}
	// Older unused tokens for the same purpose stop working.
	if _, err := s.db.Exec(ctx, `
		UPDATE account_tokens SET used_at = now()
		WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, userID, purpose); err != nil {
		return "", err
	}
	_, err = s.db.Exec(ctx, `
		INSERT INTO account_tokens (token_hash, user_id, purpose, expires_at)
		VALUES ($1, $2, $3, $4)`, hashToken(token), userID, purpose, time.Now().Add(ttl))
	return token, err
}

// sendEmail stands in for a mail service: the message goes to the backend log.
func sendEmail(to, subject, body string) {
	log.Printf("[email] to=%s subject=%q\n%s", to, subject, body)
}

func (s *Server) sendVerificationEmail(ctx context.Context, u User) {
	if s.db == nil || u.EmailVerified {
		return
	}
	token, err := s.newAccountToken(ctx, u.ID, "verify_email", verifyTokenTTL)
	if err != nil {
		log.Printf("verification email: %v", err)
		return
	}
	sendEmail(u.Email, "Confirm your BiletFlow email",
		"Open this link to confirm your email: "+s.cfg.AppURL+"/verify-email?token="+token)
}

// useAccountToken marks a valid token as used and returns its user, inside tx.
func useAccountToken(ctx context.Context, tx pgx.Tx, token, purpose string) (string, error) {
	var userID string
	err := tx.QueryRow(ctx, `
		UPDATE account_tokens SET used_at = now()
		WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
		RETURNING user_id`, hashToken(token), purpose).Scan(&userID)
	return userID, err
}

type tokenRequest struct {
	Token string `json:"token"`
}

// POST /api/auth/verify-email { token }
func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req tokenRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "verify email: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	userID, err := useAccountToken(ctx, tx, strings.TrimSpace(req.Token), "verify_email")
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "this link is invalid or has expired; ask for a new one")
		return
	}
	if err != nil {
		internalError(w, "verify email: token", err)
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET email_verified = TRUE WHERE id = $1`, userID); err != nil {
		internalError(w, "verify email: update", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "verify email: commit", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"email_verified": true})
}

// POST /api/auth/resend-verification (logged in)
func (s *Server) handleResendVerification(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var u User
	err := s.db.QueryRow(ctx, `SELECT id, email, full_name, role, email_verified, created_at FROM users WHERE id = $1`,
		claimsFrom(ctx).Subject).Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.EmailVerified, &u.CreatedAt)
	if err != nil {
		notFoundOr500(w, "resend verification", "user", err)
		return
	}
	if u.EmailVerified {
		writeJSON(w, http.StatusOK, map[string]bool{"email_verified": true})
		return
	}
	s.sendVerificationEmail(ctx, u)
	writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
}

type forgotRequest struct {
	Email string `json:"email"`
}

// POST /api/auth/forgot-password { email } - always 200, so nobody can find out which emails exist.
func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := mail.ParseAddress(email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid email address")
		return
	}
	ctx := r.Context()
	var userID string
	var suspended bool
	err := s.db.QueryRow(ctx, `SELECT id, suspended FROM users WHERE email = $1`, email).Scan(&userID, &suspended)
	if err == nil && !suspended {
		token, err := s.newAccountToken(ctx, userID, "reset_password", resetTokenTTL)
		if err != nil {
			log.Printf("forgot password: token: %v", err)
		} else {
			sendEmail(email, "Reset your BiletFlow password",
				"Open this link within 1 hour to choose a new password: "+s.cfg.AppURL+"/reset-password?token="+token+
					"\nIf you did not ask for this, ignore this email.")
		}
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("forgot password: lookup: %v", err)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type resetRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// POST /api/auth/reset-password { token, password }
func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 72 {
		writeError(w, http.StatusBadRequest, "password must be 8-72 characters")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		internalError(w, "reset password: hash", err)
		return
	}
	ctx := r.Context()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		internalError(w, "reset password: begin", err)
		return
	}
	defer tx.Rollback(context.Background())
	userID, err := useAccountToken(ctx, tx, strings.TrimSpace(req.Token), "reset_password")
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "this link is invalid or has expired; ask for a new one")
		return
	}
	if err != nil {
		internalError(w, "reset password: token", err)
		return
	}
	// Opening the emailed link also proves the address belongs to the user.
	if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $1, email_verified = TRUE WHERE id = $2`,
		string(hash), userID); err != nil {
		internalError(w, "reset password: update", err)
		return
	}
	if err := writeAudit(ctx, tx, auditEntry{ActorID: userID, Category: "account", Action: "user.password_reset",
		TargetID: userID, Message: "Password was reset with an email link"}); err != nil {
		internalError(w, "reset password: audit", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w, "reset password: commit", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
