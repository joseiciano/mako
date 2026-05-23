-- Enforce uniqueness on reminder schedule idempotency_key across all statuses
-- to prevent duplicate schedules on replay after dispatch or suppression.

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_reminder_schedules_idempotency_key
  ON notification_reminder_schedules (idempotency_key);
