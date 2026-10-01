# Story 5.15: Raw Artifact Retention and Deletion

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Enforce the 30-day raw media retention policy and remove private artifacts when interviews or accounts are deleted.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/db-schemas.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-6-private-r2-storage-module-and-bindings.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-14-participant-artifact-read-api.md`

## What Needs to Be Done

### 1. Add scheduled retention cleanup
- [x] Add a bounded repository query for artifact rows whose explicit expiry timestamp has passed and deletion tombstone is null.
- [x] Extend the existing scheduled notification-orchestrator boundary with an isolated artifact cleanup service rather than placing unbounded R2 listing in request handlers.
- [x] Delete known recording/screenshot keys directly, then clear keys and set deletion/expiry tombstones with retry-safe updates.
- [x] Use a deterministic batch limit and checkpoint/failure state so one failed object does not block the entire cleanup run.

### 2. Apply deletion semantics
- [x] Extend the existing `DELETE /api/account` soft-delete transaction to emit a durable privacy-cleanup outbox event; do not rely on an undefined interview-delete endpoint.
- [x] Process the privacy-cleanup event asynchronously to remove all shared interview raw artifacts, transcript, and feedback for interviews where the deleted user is a recorded participant, as locked in Story 5.2; the cleanup fires from the soft-delete event, not a separate permanent-purge step.
- [x] Treat already-missing R2 objects as successful idempotent cleanup.
- [x] Reconcile objects already removed by the mandatory Story 5.6 R2 lifecycle rule by retaining database expiry tombstones.

### 3. Add privacy-safe observability
- [x] Emit structured cleanup counters for scanned interviews, recording deletions, screenshot deletions, already-missing objects, failures, and cleared rows.
- [x] Do not log object keys, recording/transcript content, participant identifiers, or provider URLs.
- [x] Document the retention configuration and operational cleanup procedure in `docs/infrastructure/backend.md`.

### 4. Add retention tests
- [x] Add tests for before/after retention cutoff, batch limits, partial failure retry, already-missing objects, and key clearing after successful deletion.
- [x] Add tests proving transcript/feedback survive raw artifact expiry but are removed by permanent owner deletion.
- [x] Verify the participant artifact API returns the documented expired state after cleanup.

## Implementation Notes
- Do not scan entire buckets to infer ownership; Postgres key references are the cleanup source of truth.
- Retention duration should be environment-configurable with a production default of 30 days.

## End Goal
Raw recordings and screenshots do not live past the documented retention window, while durable reports remain available until their owning interview/account is deleted.
