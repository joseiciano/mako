-- Add feedback processing, artifact storage, recording, consent, webhook, and replay schema.
-- All changes are additive and safe for the current backend to run before application deployment.
-- Historical rows keep feedback_status = 'not_started'; no automatic historical feedback processing.

-- ============================================================================
-- 1. Interview processing and artifact columns
-- ============================================================================

ALTER TABLE interviews
  ADD COLUMN recording_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (recording_status IN ('not_started', 'pending', 'recording', 'processing', 'ready', 'failed')),
  ADD COLUMN screenshots_finalized_at TIMESTAMPTZ,
  ADD COLUMN transcript TEXT,
  ADD COLUMN feedback_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (feedback_status IN ('not_started', 'pending', 'processing', 'ready', 'failed')),
  ADD COLUMN feedback_unavailable_reason TEXT
    CHECK (feedback_unavailable_reason IS NULL OR feedback_unavailable_reason IN ('no_consent', 'unsupported_format', 'no_recording')),
  ADD COLUMN feedback_error_code TEXT
    CHECK (feedback_error_code IS NULL OR feedback_error_code IN ('assets_not_ready', 'transcription_failed', 'analysis_failed', 'invalid_feedback', 'internal_error')),
  ADD COLUMN feedback_prompt_version TEXT,
  ADD COLUMN feedback_generated_at TIMESTAMPTZ,
  ADD COLUMN feedback_attempt_id TEXT,
  ADD COLUMN feedback_processing_started_at TIMESTAMPTZ,
  ADD COLUMN feedback_processing_heartbeat_at TIMESTAMPTZ;

-- Cross-field validation: ready requires feedback/version/timestamp and no error/unavailable reason
ALTER TABLE interviews ADD CONSTRAINT interviews_feedback_ready_check CHECK (
  feedback_status <> 'ready' OR (
    feedback IS NOT NULL AND
    feedback_prompt_version IS NOT NULL AND
    feedback_generated_at IS NOT NULL AND
    feedback_error_code IS NULL AND
    feedback_unavailable_reason IS NULL
  )
);

-- Cross-field validation: failed requires an error and no unavailable reason
ALTER TABLE interviews ADD CONSTRAINT interviews_feedback_failed_check CHECK (
  feedback_status <> 'failed' OR (
    feedback_error_code IS NOT NULL AND
    feedback_unavailable_reason IS NULL
  )
);

-- Cross-field validation: processing requires attempt/start/heartbeat and no terminal fields
ALTER TABLE interviews ADD CONSTRAINT interviews_feedback_processing_check CHECK (
  feedback_status <> 'processing' OR (
    feedback_attempt_id IS NOT NULL AND
    feedback_processing_started_at IS NOT NULL AND
    feedback_processing_heartbeat_at IS NOT NULL AND
    feedback_generated_at IS NULL AND
    feedback_error_code IS NULL AND
    feedback_unavailable_reason IS NULL
  )
);

-- Cross-field validation: not_started may contain only an allowed unavailable reason
ALTER TABLE interviews ADD CONSTRAINT interviews_feedback_not_started_check CHECK (
  feedback_status <> 'not_started' OR (
    feedback_error_code IS NULL AND
    feedback_generated_at IS NULL AND
    feedback_attempt_id IS NULL AND
    feedback_processing_started_at IS NULL AND
    feedback_processing_heartbeat_at IS NULL AND
    feedback_prompt_version IS NULL AND
    (
      feedback_unavailable_reason IS NULL OR
      feedback_unavailable_reason IN ('no_consent', 'unsupported_format', 'no_recording')
    )
  )
);

-- Cross-field validation: pending clears unavailable/error/attempt fields
ALTER TABLE interviews ADD CONSTRAINT interviews_feedback_pending_check CHECK (
  feedback_status <> 'pending' OR (
    feedback_unavailable_reason IS NULL AND
    feedback_error_code IS NULL AND
    feedback_generated_at IS NULL AND
    feedback_attempt_id IS NULL AND
    feedback_processing_started_at IS NULL AND
    feedback_processing_heartbeat_at IS NULL AND
    feedback_prompt_version IS NULL
  )
);

-- Indexes for feedback status queries and stale-processing recovery
CREATE INDEX IF NOT EXISTS idx_interviews_feedback_status
  ON interviews (feedback_status);
CREATE INDEX IF NOT EXISTS idx_interviews_feedback_stale_processing
  ON interviews (feedback_processing_heartbeat_at)
  WHERE feedback_status = 'processing';

-- ============================================================================
-- 2. Normalized artifact storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS interview_artifacts (
  id UUID PRIMARY KEY,
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('playback_recording', 'transcription_audio', 'screenshot')),
  participant_id UUID REFERENCES "user"(id),
  participant_role TEXT,
  object_key TEXT,
  provider_asset_id TEXT,
  idempotency_key TEXT,
  content_metadata JSONB,
  captured_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Unique constraint for (interview_id, idempotency_key) where idempotency_key IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_artifacts_interview_idempotency
  ON interview_artifacts (interview_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Unique provider asset identity where provider_asset_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_artifacts_provider_asset
  ON interview_artifacts (provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_interview_artifacts_interview_kind
  ON interview_artifacts (interview_id, artifact_kind);
CREATE INDEX IF NOT EXISTS idx_interview_artifacts_expiry
  ON interview_artifacts (expires_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_interview_artifacts_object_key
  ON interview_artifacts (object_key);

-- ============================================================================
-- 3. Normalized provider recording jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS interview_recordings (
  id UUID PRIMARY KEY,
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  provider_recording_id TEXT NOT NULL,
  recording_type TEXT NOT NULL CHECK (recording_type IN ('composite', 'participant_track')),
  participant_id UUID REFERENCES "user"(id),
  participant_role TEXT,
  provider_status TEXT,
  stop_requested_at TIMESTAMPTZ,
  stop_confirmed_at TIMESTAMPTZ,
  finalization_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (finalization_status IN ('pending', 'processing', 'finalized', 'failed')),
  finalization_checkpoint TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Unique provider recording ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_recordings_provider
  ON interview_recordings (provider_recording_id);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_interview_recordings_interview_type
  ON interview_recordings (interview_id, recording_type);
CREATE INDEX IF NOT EXISTS idx_interview_recordings_stop_reconcile
  ON interview_recordings (stop_requested_at)
  WHERE stop_confirmed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_interview_recordings_pending_finalization
  ON interview_recordings (finalization_status)
  WHERE finalization_status IN ('pending', 'processing');

-- ============================================================================
-- 4. Consent, webhook, and replay idempotency tables
-- ============================================================================

-- Recording consent
CREATE TABLE IF NOT EXISTS interview_recording_consents (
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('consented', 'declined')),
  consent_copy_version TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (interview_id, user_id)
);

-- RealtimeKit webhook events
CREATE TABLE IF NOT EXISTS realtimekit_webhook_events (
  provider_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  recording_id TEXT,
  provider_asset_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'finalizing', 'processed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  last_error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_realtimekit_webhook_events_recording
  ON realtimekit_webhook_events (recording_id);
CREATE INDEX IF NOT EXISTS idx_realtimekit_webhook_events_pending
  ON realtimekit_webhook_events (next_attempt_at)
  WHERE processed_at IS NULL;

-- Feedback replay audit
CREATE TABLE IF NOT EXISTS feedback_replay_audit (
  id UUID PRIMARY KEY,
  interview_id UUID NOT NULL REFERENCES interviews(id),
  prior_attempt_id TEXT,
  prior_error_code TEXT,
  target_schema_version INTEGER NOT NULL,
  operator_identity TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_replay_audit_interview
  ON feedback_replay_audit (interview_id);

-- Transcription chunks
CREATE TABLE IF NOT EXISTS interview_transcription_chunks (
  id UUID PRIMARY KEY,
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  feedback_attempt_id TEXT NOT NULL,
  participant_role TEXT,
  chunk_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'transcribed', 'failed')),
  transcript_text TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Unique constraint for deterministic chunk identity
-- COALESCE ensures NULL participant_role is treated as a deterministic sentinel,
-- preserving the "retries do not retranscribe completed chunks" guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_transcription_chunks_unique
  ON interview_transcription_chunks (interview_id, feedback_attempt_id, COALESCE(participant_role, ''), chunk_index);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_interview_transcription_chunks_interview_attempt
  ON interview_transcription_chunks (interview_id, feedback_attempt_id);
CREATE INDEX IF NOT EXISTS idx_interview_transcription_chunks_pending
  ON interview_transcription_chunks (status)
  WHERE status = 'pending';
