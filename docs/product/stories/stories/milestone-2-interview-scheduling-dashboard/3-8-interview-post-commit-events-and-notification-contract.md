# Story 3.8: Interview Post-Commit Events and Notification Contract

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define and verify post-commit create/cancel integration boundaries and event payload compatibility with notification orchestration.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`

## What Needs to Be Done

### 1. Post-commit integration boundary
- [ ] Keep create/cancel orchestration integration-compatible with Story 4 notification subtasks, especially:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md`
- [ ] Emit only after successful commit; do not emit lifecycle events when transaction fails/rolls back.

### 2. Event payload compatibility contract
- [ ] Define create/cancel event payloads to match notification contract expectations:
  - event naming compatibility (`interview.created`, `interview.cancelled`)
  - required interview/participant fields
  - idempotency and replay-safe identifiers
- [ ] Keep producer ownership explicit: CRUD emits create/cancel; matcher emits `interview.match.created`.

### 3. Transaction-scope guardrails
- [ ] Do not run reminder/confirmation orchestration inside transaction scope.
- [ ] Keep reminder/confirmation handling in downstream post-commit notification orchestration.

### 4. Infrastructure/runtime alignment
- [ ] Keep runtime and transport expectations aligned with:
  - `docs/infrastructure/backend.md`
  - `docs/infrastructure/management.md`
  - `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`

### 5. Integration test coverage
- [ ] Add/update post-commit integration tests validating:
  - event payload shape
  - emit-after-commit behavior
  - no emission on rollback

### 6. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with matcher post-commit boundaries in `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`.
- [ ] Confirm no discrepancy with lifecycle docs and route boundaries in:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/api-routes.md`
- [ ] If any discrepancy is found, update story/docs before implementation.

## End Goal
Interview CRUD emits contract-stable lifecycle events only after successful commit, with payloads and runtime boundaries that integrate safely with notification orchestration.
