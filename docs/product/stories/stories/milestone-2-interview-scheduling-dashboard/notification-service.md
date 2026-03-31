# Story 4: Notification Service

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement post-commit interview notification orchestration using queue + workflow boundaries consistent with the matcher and interview CRUD lifecycle.
**Status**: Todo

## What Needs to Be Done

### 1. Trigger boundaries and source-of-truth alignment
- [ ] Treat this story as the source-of-truth for Milestone 2 notification orchestration compatibility used by:
  - `3-5-interview-create-route-post-api-interviews.md`
  - `3-7-interview-cancel-route-post-api-interviews-id-cancel.md`
  - `3-8-interview-post-commit-events-and-notification-contract.md`
  - `1-5-post-commit-events-and-lifecycle-boundaries.md`
- [ ] Accept only **post-commit** interview lifecycle signals as notification triggers.
- [ ] Keep lifecycle boundaries aligned with:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/api-routes.md`
- [ ] Explicitly keep Realtime/whiteboard provisioning out of scope for this story and out of notification-trigger side effects.

### 2. Internal event contract (post-commit only)
- [ ] Define and use a normalized internal event payload contract for queue hand-off:
  - `event_type`: one of
    - `interview.created`
    - `interview.cancelled`
    - `interview.match.created`
  - `event_id`: unique event ID
  - `idempotency_key`: stable key for dedupe/replay safety
  - `occurred_at`: ISO timestamp
  - `interview`: `{ id, scheduler_id, interviewer_id, type, mode, tier, status, scheduled_at }`
  - `participants`: `{ scheduler_user_id, interviewer_user_id | null }`
- [ ] Document which producer emits which event:
  - interview CRUD create/cancel emits `interview.created` / `interview.cancelled`
  - matcher emits `interview.match.created`
- [ ] Define required vs optional fields so consumers can validate payloads deterministically.

### 3. Transport and reliability contract
- [ ] Use the pre-provisioned queue/worker infrastructure from `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`.
- [ ] Keep queue delivery assumptions explicit:
  - at-least-once delivery
  - consumer-side idempotency using `idempotency_key`
  - safe retry behavior for transient failures
- [ ] Ensure failed processing does not mutate interview lifecycle state in ways that bypass source route/matcher ownership.

### 4. Workflow behavior for reminders/confirmations
- [ ] On `interview.created` or `interview.match.created`, send confirmation notifications after successful commit only.
- [ ] Schedule reminder notifications for 30 minutes before `scheduled_at` when `status = 'scheduled'`.
- [ ] On `interview.cancelled`, cancel or suppress pending reminders.
- [ ] Keep behavior consistent with `docs/system/system-design/diagrams.md` and `docs/system/system-design/state-management-lifecycle.md`.

### 5. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with previous stories:
  - `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-8-interview-post-commit-events-and-notification-contract.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
  - `docs/product/stories/milestones.md`
- [ ] Confirm no discrepancy with design docs:
  - `docs/infrastructure/backend.md`
  - `docs/infrastructure/management.md`
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/api-routes.md`

## End Goal
Notification orchestration is explicitly specified with a stable post-commit event contract, queue/workflow reliability boundaries, and lifecycle-safe behavior for confirmations/reminders without coupling notification side effects to in-transaction writes.
