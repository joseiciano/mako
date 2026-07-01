-- Add timer orchestration columns to interviews table for workflow-backed session timer.
-- started_at: when the interview transitioned to ongoing (timer start boundary)
-- expires_at: 60-minute session expiration timestamp
-- warning_at: 5-minute warning timestamp (55 minutes from start)

ALTER TABLE interviews
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN warning_at TIMESTAMPTZ;
