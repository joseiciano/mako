# Story 4.3: Notification Transport, Reliability, and Idempotency

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define queue transport guarantees, retry behavior, and idempotent processing boundaries for notification workflows.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`

## What Needs to Be Done

### 1. Infrastructure and runtime boundary lock
- [ ] Use the pre-provisioned queue/worker infrastructure from `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`.
- [ ] Keep queue/worker runtime assumptions aligned with:
  - `docs/infrastructure/backend.md`
  - `docs/infrastructure/management.md`
- [ ] Keep transport behavior strictly post-commit hand-off and out of route transaction scope.

### 2. Delivery semantics and retry assumptions
- [ ] Keep delivery assumptions explicit:
  - at-least-once delivery
  - consumer-side idempotency keyed by `idempotency_key` as the single canonical dedupe key
  - safe retry behavior for transient failures
- [ ] Define transient vs terminal processing failures and expected retry behavior for each category.
- [ ] Ensure failed processing does not silently drop events.

### 3. Idempotent processing behavior
- [ ] Ensure replay/retry of the same logical event does not produce duplicate downstream side effects.
- [ ] Ensure replayed/duplicate delivery of the same emitted `interview.cancelled` event does not produce duplicate reminder suppression/cancellation actions.
- [ ] Ensure idempotency behavior is deterministic across worker restarts/retries.

### 4. Lifecycle state ownership guardrails
- [ ] Ensure notification consumers do not mutate interview lifecycle state outside source route/matcher ownership boundaries.
- [ ] Ensure processing failures do not bypass lifecycle ownership defined in:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/api-routes.md`

### 5. Reliability and observability coverage
- [ ] Add/update reliability tests for retry + dedupe behavior under repeated delivery.
- [ ] Add/update logs/metrics for:
  - events consumed
  - dedupe hits
  - retries
  - terminal failures
- [ ] Keep observability expectations compatible with `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-6-reliability-tests-and-observability.md`.

## End Goal
Queue transport reliability boundaries are explicit, retry/replay behavior is safe under at-least-once delivery, and notification processing remains idempotent without violating lifecycle ownership.
