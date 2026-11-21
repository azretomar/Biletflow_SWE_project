package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
	id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email          TEXT NOT NULL UNIQUE,
	password_hash  TEXT NOT NULL,
	full_name      TEXT NOT NULL,
	role           TEXT NOT NULL CHECK (role IN ('attendee','organizer','event_admin','platform_admin')),
	email_verified BOOLEAN NOT NULL DEFAULT FALSE,
	created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

// Every file adds its own tables here from an init() function:
//   func init() { schemas = append(schemas, schemaEvents) }
// So nobody needs to edit this file again.
var schemas = []string{schema}

// Changes to tables that already exist (new columns, wider CHECKs). They run after
// every CREATE TABLE above and must be safe to run again on each start
// (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, ...).
var alterSchemas []string

func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	for _, s := range append(append([]string{}, schemas...), alterSchemas...) {
		if _, err := pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	return nil
}
