-- Interviewer application persistence for immutable employment snapshots and admin review.
-- This table stores application evidence separate from mutable user_companies rows.

CREATE TABLE IF NOT EXISTS user_interviewer_applications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES "user"(id),
  email TEXT NOT NULL,
  employment_history JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Ensure employment_history is a top-level JSON array
ALTER TABLE user_interviewer_applications
  ADD CONSTRAINT user_interviewer_applications_history_array_check
  CHECK (jsonb_typeof(employment_history) = 'array');

-- Partial unique index: at most one pending OR approved application per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_interviewer_applications_active_user
  ON user_interviewer_applications (user_id)
  WHERE status IN ('pending', 'approved');

-- Latest application lookup for authenticated status
CREATE INDEX IF NOT EXISTS idx_user_interviewer_applications_user_latest
  ON user_interviewer_applications (user_id, created_at DESC, id DESC);

-- Admin review list: status filter + oldest-first ordering
CREATE INDEX IF NOT EXISTS idx_user_interviewer_applications_status_created
  ON user_interviewer_applications (status, created_at ASC, id ASC);
