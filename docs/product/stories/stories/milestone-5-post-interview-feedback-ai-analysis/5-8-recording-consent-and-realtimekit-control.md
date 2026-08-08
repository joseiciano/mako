# Story 5.8: Recording Consent and RealtimeKit Control

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Implement participant consent and server-controlled RealtimeKit recording start/stop behavior for eligible live interviews.
**Status**: In-Progress
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-6-real-time-communication.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-4-feedback-and-artifact-schema-migration.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-6-private-r2-storage-module-and-bindings.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-7-interview-completed-feedback-event.md`

## What Needs to Be Done

### 1. Add participant recording-consent API behavior
- [ ] Document and implement participant-only `POST /api/interviews/:id/recording-consent` and `DELETE /api/interviews/:id/recording-consent` routes through interview controller/service/repository modules under `packages/shared-backend/src/interviews/`.
- [ ] Accept an explicit `consented` or `declined` decision plus the current consent-copy version; make writes idempotent, scoped to the authenticated participant, and invalid after recording has started.
- [ ] Return the current user's decision and overall recording state; do not expose aggregate consent readiness that reveals another participant's individual decision.
- [ ] Require one active consent for AI-led sessions and active consent from both assigned participants for peer-to-peer sessions.

### 2. Add a RealtimeKit recording adapter
- [ ] Add a dependency-injected RealtimeKit recording repository/service for composite recording, participant audio-track recording, stop, active-recording reconciliation, and status requests using the existing interview Realtime session identifier.
- [ ] Route both lifecycle start and the final required consent grant through one `ensureRecordingStarted` operation so request ordering cannot leave an eligible ongoing interview unrecorded.
- [ ] Persist a recording-start claim before the provider call; after timeout/ambiguous response, query active provider recordings and reconcile before retrying.
- [ ] Configure one composite playback recording plus participant-separated audio tracks mapped to scheduler/interviewer roles, including a candidate-specific track for AI-led sessions, each bounded to 3,600 seconds; Story 5.11 owns private R2 finalization.
- [ ] Persist each returned provider recording ID as a separate `interview_recordings` row so webhook resolution, stop reconciliation, and finalization are per job rather than attached to one aggregate ID.
- [ ] On the first completion transaction, persist a durable recording-stop/reconciliation handoff instead of calling RealtimeKit inside the database transaction; the consumer must stop provider recordings idempotently before feedback handoff. Story 5.7 owns the canonical completion transaction (outbox event + feedback eligibility); this story extends that same transaction with the recording-stop handoff.

### 3. Configure secrets and runtime wiring
- [ ] Add the required RealtimeKit API token to Worker bindings, local development documentation, deployment workflows, and `scripts/set-github-env-secrets.sh`.
- [ ] Configure the non-secret RealtimeKit webhook public-key URL; webhook signature verification does not use an application webhook secret.
- [ ] Register the adapter in `apps/backend-rest/src/index.ts` without exposing provider credentials to shared client code.
- [ ] Add explicit error mapping for provider unavailable, invalid meeting, duplicate active recording, and terminal recording failures.

### 4. Add backend coverage
- [ ] Add tests for AI-led and peer-to-peer decisions/copy versions, non-participant rejection, revocation timing, privacy of the other participant's decision, and idempotent retries.
- [ ] Add tests proving recording cannot start before `ongoing`, without all required consents, or more than once, including start-before-final-consent and final-consent-before-start ordering.
- [ ] Add tests for ambiguous provider-start reconciliation, multiple provider IDs, AI-led candidate-track mapping, peer participant-role mapping, and durable manual-end/workflow-timeout stop handoff.

## Implementation Notes
- Declining or omitting consent does not prevent the interview from running; it prevents recording, transcription, and automated feedback for that interview.
- Do not place RealtimeKit credentials, recording IDs, or consent records in public list responses.

## End Goal
Eligible sessions start and stop one server-controlled RealtimeKit recording only after required participant consent, with deterministic lifecycle and retry behavior.
