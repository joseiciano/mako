# Story 5.4: Feedback and Artifact Schema Migration

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Add the durable Postgres state required for recording finalization, consent, transcription, feedback processing, and webhook idempotency.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/db-schemas.md`
- `docs/system/system-design/concurrency-data-integrity.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/1-3-database-migration-system.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-1-feedback-lifecycle-consent-and-processing-state-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-2-private-artifact-retention-and-api-exposure-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-3-feedback-report-data-contract-and-architecture-reconciliation.md`

## What Needs to Be Done

### 1. Add interview processing and artifact columns
- [ ] Create a versioned raw SQL migration in `packages/shared-backend/migrations/` adding aggregate `recording_status`, `screenshots_finalized_at`, `transcript`, `feedback_status`, `feedback_unavailable_reason`, `feedback_error_code`, `feedback_prompt_version`, `feedback_generated_at`, `feedback_attempt_id`, `feedback_processing_started_at`, and `feedback_processing_heartbeat_at` to `interviews`.
- [ ] Constrain `recording_status` to `not_started`, `pending`, `recording`, `processing`, `ready`, or `failed` and default it to `not_started`.
- [ ] Constrain `feedback_status` to `not_started`, `pending`, `processing`, `ready`, or `failed` and default it to `not_started`.
- [ ] Add cross-field checks so `ready` requires feedback/version/timestamp and no error/unavailable reason; `failed` requires an error and no unavailable reason; `processing` requires attempt/start/heartbeat and no terminal fields; `not_started` may contain only an allowed unavailable reason; and `pending` clears unavailable/error/attempt fields.
- [ ] Keep existing `recording_url` and `screenshot_urls` columns during the compatibility window, but mark them deprecated in `docs/system/system-design/db-schemas.md`; new writes must use normalized artifact rows.

### 2. Add normalized artifact storage
- [ ] Add `interview_artifacts` with application-generated UUID, interview ID, artifact kind (`playback_recording`, `transcription_audio`, `screenshot`), optional participant ID/role for transcription tracks, private object key, provider asset ID, idempotency key, trusted content metadata, capture/finalized/expiry/deleted timestamps, and foreign keys.
- [ ] Add unique constraints for `(interview_id, idempotency_key)` and provider asset identity, plus query indexes by interview/kind and expiry.
- [ ] Treat `screenshots_finalized_at IS NULL` as upload-open; a timestamp means finalized, and zero screenshot artifact rows at that point means a valid finalized-empty set.
- [ ] Retain expiry/deletion tombstones after clearing object keys so the API can distinguish expired artifacts from artifacts that never existed.

### 3. Add normalized provider recording jobs
- [ ] Add `interview_recordings` with application-generated UUID, interview ID, unique provider recording ID, recording type (`composite` or `participant_track`), optional participant ID/role, provider status, stop-requested/confirmed timestamps, finalization status/checkpoint, safe error code, and timestamps.
- [ ] Persist the composite playback job and every required participant-track job separately; derive aggregate `interviews.recording_status` only after evaluating all required recording rows/artifacts.
- [ ] Add indexes for interview/type lookup, provider webhook resolution, incomplete stop reconciliation, and pending finalization sweeps.

### 4. Add consent, webhook, and replay idempotency tables
- [ ] Add `interview_recording_consents` with interview/user IDs, `decision` (`consented` or `declined`), consent-copy version, decision timestamp, optional revocation timestamp, timestamps, a composite primary key, and foreign keys.
- [ ] Add `realtimekit_webhook_events` with provider event UUID as primary key, event type, recording/provider asset ID, constrained status (`accepted`, `finalizing`, `processed`, `failed`), attempt count, next attempt timestamp, received/processed timestamps, and safe last error code.
- [ ] Add `feedback_replay_audit` with application-generated UUID, interview ID, prior attempt/error, target schema version, operator identity, reason, and timestamp.
- [ ] Add `interview_transcription_chunks` keyed by interview, feedback attempt, participant role, and deterministic chunk index with status, bounded transcript text, and timestamps so retries do not retranscribe completed chunks.
- [ ] Add indexes for recording lookup, feedback status/stale-processing recovery, webhook finalization sweeps, and artifact retention queries.

### 5. Define migration and backfill behavior
- [ ] Leave all historical rows `feedback_status = 'not_started'`; do not attempt automatic historical feedback validation, enqueueing, or generation in the migration.
- [ ] Do not copy legacy URL values into normalized artifact rows because existing URL provenance is not guaranteed to be a private R2 key.
- [ ] Ensure the migration is additive and safe for the current backend to run before application deployment.

### 6. Add migration verification coverage
- [ ] Add schema-readiness tests for all columns, checks, foreign keys, and indexes.
- [ ] Add migration tests proving invalid/cross-field statuses are rejected and duplicate provider-recording, artifact, participant-decision, webhook, transcription-chunk, and replay identities are constrained.
- [ ] Verify legacy interview reads remain valid during the compatibility window.

## Implementation Notes
- Use raw SQL through the existing migration system; do not introduce a parallel migration tool.
- Provider error bodies and signed download URLs must not be persisted.

## End Goal
Postgres can durably represent versioned consent, normalized private artifacts, transcript content, fenced processing attempts, validated feedback, retention tombstones, replay audits, and webhook finalization without breaking existing interview reads.
