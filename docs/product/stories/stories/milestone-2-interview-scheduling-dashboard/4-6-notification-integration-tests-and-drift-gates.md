# Story 4.6: Notification Integration Tests and Drift Gates

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Validate end-to-end post-commit notification integration and enforce story/doc drift-prevention gates before implementation.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-4-confirmation-and-reminder-workflow-rules.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-5-cancellation-reminder-suppression-rules.md`

## What Needs to Be Done

### 1. Producer-to-consumer integration test matrix
- [x] Add/update integration tests validating all supported event producers and event types:
  - CRUD create -> `interview.created`
  - CRUD cancel -> `interview.cancelled`
  - matcher write -> `interview.match.created`
- [x] Validate payload contract shape, required fields, nullable fields, and event-type correctness.
- [x] Validate event-type participant-B requiredness matrix:
  - `interview.created`: `interview.interviewer_id` / `participants.interviewer_user_id` nullable
  - `interview.match.created`: `interview.interviewer_id` / `participants.interviewer_user_id` required non-null
- [x] Validate `interview.cancelled` participant-B field behavior mirrors persisted interview shape at cancellation time (non-null for peer-to-peer rows, nullable for AI-led rows).
- [x] Validate canonical/derived participant identity consistency when both are present (`interview.*` IDs must equal `participants.*` IDs).

### 2. Commit boundary correctness tests
- [x] Validate emit-after-commit behavior for create/cancel/match producer paths.
- [x] Validate no emission on transaction rollback/failure paths.
- [x] Validate cancel emits `interview.cancelled` on first successful `scheduled -> cancelled` transition.
- [x] Validate idempotent cancel retry (`cancelled -> cancelled`) does not emit a second `interview.cancelled` event.

### 3. Reliability and replay tests
- [x] Validate at-least-once replay handling does not duplicate side effects.
- [x] Validate duplicate/replayed delivery of the same emitted cancel event remains idempotent in downstream processing.
- [x] Validate transient failure retries preserve idempotency guarantees.
- [x] Validate deterministic `idempotency_key` generation and stable key reuse for retries/replays of the same lifecycle transition.

### 4. Workflow behavior correctness tests
- [x] Validate confirmation behavior for `interview.created` and `interview.match.created`.
- [x] Validate reminder scheduling at 30-minute lead.
- [x] Validate suppression for past-due and <30-minute windows.
- [x] Validate cancellation suppresses/cancels pending reminders.

### 5. Cross-story compatibility checks
- [x] Confirm no discrepancy with previous stories:
  - `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-8-interview-post-commit-events-and-notification-contract.md`
  - `docs/product/stories/milestones.md`

## End Goal
Notification orchestration is verified end-to-end with commit-safe producer boundaries, contract-stable event payloads, idempotent reliability behavior, and explicit drift gates across stories and system design docs.
