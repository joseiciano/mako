-- Persist interview lifecycle events durably so queue delivery can be retried after commit.

CREATE TABLE IF NOT EXISTS interview_post_commit_outbox (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  last_publish_attempt_at TIMESTAMPTZ,
  publish_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_publish_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_interview_post_commit_outbox_pending
  ON interview_post_commit_outbox (published_at, created_at, id)
  WHERE published_at IS NULL;
