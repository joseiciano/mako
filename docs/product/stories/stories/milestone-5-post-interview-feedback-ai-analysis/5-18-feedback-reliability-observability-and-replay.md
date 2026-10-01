# Story 5.18: Feedback Reliability, Observability, and Replay

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Harden post-interview processing with bounded retries, safe terminal errors, structured telemetry, and an operational replay procedure.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/concurrency-data-integrity.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-10-feedback-workflow-definition-and-trigger.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-16-workers-ai-recording-transcription.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-17-ai-gateway-feedback-analysis-and-persistence.md`

## What Needs to Be Done

### 1. Define retry and failure behavior
- [x] Configure bounded per-step retries, exponential backoff, and timeouts for recording readiness, R2 reads, Workers AI transcription, AI Gateway analysis, and Postgres writes.
- [x] Wait a bounded finalization period for required recording/audio artifacts; after a bounded screenshot-finalization wait, continue with available screenshots or an empty set because screenshots are optional evidence.
- [x] Distinguish retryable infrastructure/provider failures from non-retryable validation/eligibility failures.
- [x] On exhausted failure, conditionally set `feedback_status = 'failed'` with one safe code such as `assets_not_ready`, `transcription_failed`, `analysis_failed`, `invalid_feedback`, or `internal_error`, fenced by the active attempt ID.
- [x] For unsupported participant-track format or role mapping discovered after claim, transition attempt-fenced `processing -> not_started`, persist a safe unavailable reason, and clear processing/error fields rather than classifying the interview as a failed infrastructure job.
- [x] For no recording discovered after claim (consent was granted but recording never started or no `interview_recordings` rows exist), transition attempt-fenced `processing -> not_started` with the `no_recording` unavailable reason and clear processing/error fields; distinguish this from `assets_not_ready` (recording exists but artifacts are not yet available after the bounded wait).

### 2. Add privacy-safe observability
- [x] Emit structured workflow events for received, claimed, waiting_for_assets, transcribed, analysis_started, ready, retrying, and failed states.
- [x] Include interview ID, workflow instance ID, prompt/schema version, step, attempt, duration, and safe error code.
- [x] Emit aggregate transcript/image size and truncation metrics without content.
- [x] Prohibit transcript text, feedback prose, aliases, object keys, signed URLs, provider credentials, and raw provider payloads from logs.

### 3. Add operational replay
- [x] Document an operator-only procedure to inspect a failed workflow, verify/correct artifact state, reset `failed -> pending`, and restart with a new versioned workflow instance ID.
- [x] Insert a durable `feedback_replay_audit` row for replay actor, interview ID, prior attempt/error, target schema version, reason, and timestamp.
- [x] Define stale-processing recovery using processing start/heartbeat age: fence the prior attempt, reset to pending, and create a uniquely suffixed replay instance while preventing the old workflow from writing.
- [x] Prevent replay when feedback is already ready unless a future migration explicitly introduces a new feedback schema version.
- [x] Do not add a participant-facing regenerate endpoint or UI control.

### 4. Add resilience coverage
- [x] Add tests for every retryable/non-retryable class, exhausted retry, terminal status persistence, and recovery from failure before final attempt.
- [x] Add concurrency tests for duplicate queue delivery, parallel workflow claims, stale-attempt recovery, replay vs active processing, and duplicate ready writes.
- [x] Add log-redaction assertions covering transcript, feedback, object-key, and credential sentinel values.

## Implementation Notes
- External AI inference can be invoked more than once if a provider succeeds immediately before a Worker failure; deterministic requests reduce cost, while conditional database writes provide logical exactly-once persistence.
- Workflow status is operational state, not the long-term client source of truth; Postgres processing fields remain authoritative.

## End Goal
Feedback processing fails predictably, retries only bounded work, exposes actionable safe telemetry, and can be replayed by operators without duplicate reports or sensitive-data leakage.
