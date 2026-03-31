# Story 4.6: Notification Integration Tests and Drift Gates

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Validate end-to-end post-commit notification integration and enforce story/doc drift-prevention gates before implementation.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-4-confirmation-and-reminder-workflow-rules.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-5-cancellation-reminder-suppression-rules.md`

## What Needs to Be Done

### 1. Producer-to-consumer integration test matrix
- [ ] Add/update integration tests validating all supported event producers and event types:
  - CRUD create -> `interview.created`
  - CRUD cancel -> `interview.cancelled`
  - matcher write -> `interview.match.created`
- [ ] Validate payload contract shape, required fields, nullable fields, and event-type correctness.

### 2. Commit boundary correctness tests
- [ ] Validate emit-after-commit behavior for create/cancel/match producer paths.
- [ ] Validate no emission on transaction rollback/failure paths.

### 3. Reliability and replay tests
- [ ] Validate at-least-once replay handling does not duplicate side effects.
- [ ] Validate repeated cancel events remain idempotent in downstream processing.
- [ ] Validate transient failure retries preserve idempotency guarantees.

### 4. Workflow behavior correctness tests
- [ ] Validate confirmation behavior for `interview.created` and `interview.match.created`.
- [ ] Validate reminder scheduling at 30-minute lead.
- [ ] Validate suppression for past-due and <30-minute windows.
- [ ] Validate cancellation suppresses/cancels pending reminders.

### 5. Cross-story compatibility checks
- [ ] Confirm no discrepancy with previous stories:
  - `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-8-interview-post-commit-events-and-notification-contract.md`
  - `docs/product/stories/milestones.md`

### 6. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with design docs:
  - `docs/infrastructure/backend.md`
  - `docs/infrastructure/management.md`
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/api-routes.md`
  - `docs/system/system-design/matching-tiers.md`
  - `docs/system/system-design/db-schemas.md`
- [ ] If any discrepancy is found, update story/docs before implementation.

## End Goal
Notification orchestration is verified end-to-end with commit-safe producer boundaries, contract-stable event payloads, idempotent reliability behavior, and explicit drift gates across stories and system design docs.
