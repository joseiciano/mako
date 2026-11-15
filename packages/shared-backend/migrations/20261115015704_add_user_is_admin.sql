-- Migration: 20261115015704_add_user_is_admin.sql
-- Created at: 2026-11-15T01:57:04.289Z

-- Write SQL statements below this line.

-- Server-owned admin flag. Existing rows default to non-admin. Only
-- operational SQL (docs/operations/admin-access.md) may set it; Better Auth
-- registers it with input: false so no client path can write it.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT FALSE;
