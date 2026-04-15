-- Add participant-scoped interview listing indexes for filtered ordering.

CREATE INDEX IF NOT EXISTS idx_interviews_scheduler_scheduled_at_id
  ON interviews (scheduler_id, scheduled_at, id);

CREATE INDEX IF NOT EXISTS idx_interviews_interviewer_scheduled_at_id
  ON interviews (interviewer_id, scheduled_at, id);

CREATE INDEX IF NOT EXISTS idx_interviews_scheduler_status_scheduled_at_id
  ON interviews (scheduler_id, status, scheduled_at, id);

CREATE INDEX IF NOT EXISTS idx_interviews_interviewer_status_scheduled_at_id
  ON interviews (interviewer_id, status, scheduled_at, id);
