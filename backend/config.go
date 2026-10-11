package main

import (
	"log"
	"os"
)

type Config struct {
	DatabaseURL string
	JWTSecret   []byte
	Port        string
}

func loadConfig() Config {
	cfg := Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   []byte(os.Getenv("JWT_SECRET")),
		Port:        os.Getenv("PORT"),
	}
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		log.Fatal("JWT_SECRET is required and must be at least 32 characters")
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	return cfg
}
