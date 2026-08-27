-- Recording finalization sweep partial index for bounded UPLOADED pending/failed/processing recovery.
CREATE INDEX IF NOT EXISTS idx_interview_recordings_recording_finalization_sweep
  ON interview_recordings (provider_status, finalization_status, provider_recording_id)
  WHERE provider_status = 'UPLOADED' AND finalization_status IN ('pending', 'failed', 'processing');