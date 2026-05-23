-- Add notification reliability tables for durable outbox, processing checkpoints, and reminder schedules.

CREATE TABLE IF NOT EXISTS notification_outbox_events (
  idempotency_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'dispatched', 'failed')),
  dispatch_attempts INTEGER NOT NULL DEFAULT 0,
  last_dispatch_attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_events_pending
  ON notification_outbox_events (created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS notification_processing_checkpoints (
  idempotency_key TEXT NOT NULL,
  checkpoint_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (idempotency_key, checkpoint_key)
);

CREATE TABLE IF NOT EXISTS notification_reminder_schedules (
  id UUID PRIMARY KEY,
  interview_id UUID NOT NULL REFERENCES interviews(id),
  idempotency_key TEXT NOT NULL,
  reminder_due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'suppressed', 'dispatched')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_reminder_schedules_due
  ON notification_reminder_schedules (reminder_due_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_reminder_schedules_active_interview
  ON notification_reminder_schedules (interview_id)
  WHERE status = 'pending';
