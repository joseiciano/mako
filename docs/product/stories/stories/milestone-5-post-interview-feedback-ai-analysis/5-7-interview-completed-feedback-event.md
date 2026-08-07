# Story 5.7: Interview Completed Feedback Event

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Emit one durable interview-completed event that hands eligible terminal sessions to the feedback workflow.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/concurrency-data-integrity.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-10-session-workflow-timer-orchestration.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-12-session-lifecycle-concurrency-and-observability.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-4-feedback-and-artifact-schema-migration.md`

## What Needs to Be Done

### 1. Define the completion event contract
- [ ] Add and export a strict `interview.completed` event schema in the existing shared notification/orchestration contracts.
- [ ] Use `interview.completed:{interview_id}` as the durable idempotency key and keep the payload limited to interview ID and safe completion metadata.
- [ ] Do not place transcripts, artifact keys, aliases, workflow credentials, or feedback inputs in the queue payload.

### 2. Emit completion atomically
- [ ] Insert the completion outbox event in the same transaction as the first successful `ongoing -> completed` transition.
- [ ] Apply the same completion service/repository path to manual end and workflow timeout so both converge on one event.
- [ ] Ensure repeated/concurrent end operations and timeout races do not create duplicate outbox rows or reset feedback state.
- [ ] Set `feedback_status = 'pending'` only when recording consent was granted by all required participants (indicating the interview was eligible for recording); leave interviews where consent was declined or omitted at `not_started` with a `no_consent` unavailable reason. Recording start success is not required at this point; the feedback workflow handles recording failures during artifact readiness.
- [ ] Keep provider calls outside the completion transaction; atomically persist status, screenshot finalization, feedback eligibility, and outbox handoff only.

### 3. Route the event through existing transport
- [ ] Extend the existing outbox dispatch and notification-orchestrator queue parser to recognize `interview.completed` without changing notification event behavior.
- [ ] Checkpoint idempotent stop requests for every `interview_recordings` row, then create/confirm the feedback workflow without synchronously waiting for webhook finalization; the workflow's artifact-readiness step owns the bounded wait.
- [ ] Keep at-least-once delivery assumptions explicit and acknowledge only after workflow handoff succeeds or is confirmed idempotent.

### 4. Add completion-event tests
- [ ] Add tests for manual completion, timeout completion, repeated end, end/timeout races, ineligible recordings, and transaction rollback.
- [ ] Add outbox dispatch/consumer tests for duplicate delivery and strict payload validation.
- [ ] Verify no event is emitted for scheduled, cancelled, or failed transition attempts.

## Implementation Notes
- The event announces committed completion; the workflow reloads canonical interview/artifact state from Postgres.
- Notification delivery and feedback generation may both react to completion, but their side effects must keep separate checkpoints.
- This story owns the canonical `ongoing -> completed` completion transaction. Stories 5.8 (recording-stop handoff) and 5.9 (screenshot finalization) extend this same transaction with additional writes; they list this story as a prerequisite to ensure the completion transaction is established first.

## End Goal
Every eligible completed interview produces one durable, retry-safe handoff to feedback processing regardless of whether completion came from a participant or the timer workflow.
