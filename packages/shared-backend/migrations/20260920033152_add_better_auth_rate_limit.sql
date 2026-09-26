-- Migration: 20260920033152_add_better_auth_rate_limit.sql
-- Created at: 2026-09-20T03:31:52.310Z

-- Adds the Better Auth database-backed rate limit table.
-- Model and field names follow Better Auth 1.5.6 defaults:
-- model "rateLimit", fields key/count/lastRequest, where lastRequest is
-- epoch milliseconds stored as BIGINT.

CREATE TABLE IF NOT EXISTS "rateLimit" (
  "key" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL
);
