-- Decision timestamp for interviewer application review (Story 7.8).
-- Null while pending; set together with status and reviewed_by on a decision.
ALTER TABLE user_interviewer_applications
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
