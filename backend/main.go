package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	cfg := loadConfig()
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("db ping: %v", err)
	}
	if err := migrate(ctx, pool); err != nil {
		log.Fatal(err)
	}

	s := &Server{db: pool, cfg: cfg}
	organizerOnly := func(h http.HandlerFunc) http.Handler {
		return s.requireAuth(s.requireRole("organizer")(h))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// auth
	mux.HandleFunc("POST /api/auth/signup", s.handleSignup)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.Handle("GET /api/me", s.requireAuth(http.HandlerFunc(s.handleMe)))

	// events + ticket types
	mux.HandleFunc("GET /api/events", s.handleListEvents)
	mux.HandleFunc("GET /api/events/{id}", s.handleGetEvent)
	mux.Handle("POST /api/events", organizerOnly(s.handleCreateEvent))
	mux.Handle("POST /api/events/{id}/ticket-types", organizerOnly(s.handleCreateTicketType))

	// tickets (friend adds his routes below)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
	}
	log.Printf("BiletFlow API listening on :%s", cfg.Port)
	log.Fatal(srv.ListenAndServe())
}
