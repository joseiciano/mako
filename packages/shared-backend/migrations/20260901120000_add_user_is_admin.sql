-- Server-owned admin flag. Only assigned through the operational SQL runbook (docs/operations/admin-access.md).
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT FALSE;
