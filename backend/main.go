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
	mux := s.routes()

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

// routes builds every API route. Tests use it too.
func (s *Server) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// auth
	mux.HandleFunc("POST /api/auth/signup", s.handleSignup)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.Handle("GET /api/me", s.requireAuth(http.HandlerFunc(s.handleMe)))
	s.registerAccountRoutes(mux)
	s.registerEventRoutes(mux)
	s.registerTicketRoutes(mux)
	s.registerStaffRoutes(mux)
	s.registerOrganizerRoutes(mux)
	s.registerOrderRoutes(mux)
	s.registerPromoRoutes(mux)
	s.registerSupportRoutes(mux)
	s.registerAdminRoutes(mux)

	// tickets (friend adds his routes below)
	return mux
}
