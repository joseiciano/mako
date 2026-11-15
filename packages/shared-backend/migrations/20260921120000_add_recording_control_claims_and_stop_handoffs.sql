-- Story 5.8: recording start claim columns and durable recording-stop handoff.
-- Additive only: nullable columns and a new table; safe for the current backend to run first.

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS recording_start_claim_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_start_claimed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS interview_recording_stop_handoffs (
  interview_id UUID PRIMARY KEY REFERENCES interviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_interview_recording_stop_handoffs_pending
  ON interview_recording_stop_handoffs (created_at)
  WHERE processed_at IS NULL;
