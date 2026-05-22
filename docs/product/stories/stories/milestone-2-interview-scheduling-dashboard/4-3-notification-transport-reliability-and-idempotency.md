# Story 4.3: Notification Transport, Reliability, and Idempotency

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Lock queue transport guarantees, producer hand-off failure policy, and durable idempotent processing boundaries for notification workflows.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`
- `docs/system/system-design/state-management-lifecycle.md`

## What Needs to Be Done

### 1. Transport runtime reconciliation and boundary lock
- [ ] Reconcile any legacy queue/worker/binding naming that still implies interview provisioning with the Milestone 2 notification-orchestration purpose across Terraform, worker entrypoints, backend bindings, and related docs.
- [ ] Use the pre-provisioned queue/worker infrastructure from `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`, but keep Realtime/whiteboard provisioning out of this transport path.
- [ ] Keep transport behavior strictly post-commit hand-off for `interview.created`, `interview.cancelled`, and `interview.match.created`, never inside route or matcher transaction scope.

### 2. Producer hand-off failure policy
- [ ] Define explicit expected behavior when a lifecycle event cannot be enqueued after the source database commit has already succeeded.
- [ ] Unify producer-side failure semantics across direct interview create/cancel paths and matcher-created paths so queue publish failures are handled consistently.
- [ ] Define required recovery/visibility behavior for failed enqueue attempts (for example: structured logging, retry/repair path, and operator visibility) so committed lifecycle events are not silently lost.

### 3. Delivery semantics, retry classification, and reminder transport
- [ ] Keep delivery assumptions explicit:
  - at-least-once delivery
  - consumer-side idempotency keyed by `idempotency_key` as the canonical dedupe key
  - safe retry behavior for transient failures
- [ ] Define transient vs terminal consumer failures and the required retry/ack behavior for each category.
- [ ] Lock the transport used for 30-minute reminder timing so Stories 4.4 and 4.5 have a stable runtime assumption (for example: delayed queue delivery or persisted reminder scheduling), and keep it separate from Cloudflare Workflow ownership used for in-session lifecycle timers.
- [ ] Ensure failed processing paths do not silently drop notification or reminder work.

### 4. Durable idempotency and processing checkpoints
- [ ] Ensure replay/retry of the same logical event does not produce duplicate downstream side effects for confirmation delivery, reminder scheduling, or cancellation-side suppression.
- [ ] Ensure replayed/duplicate delivery of the same emitted `interview.cancelled` event does not produce duplicate reminder suppression/cancellation actions.
- [ ] Persist dedupe/checkpoint state in a durable store so idempotency remains deterministic across worker restarts, retries, and redeploys.
- [ ] Keep `idempotency_key` as the canonical root dedupe key while defining any per-side-effect checkpoints needed when one event fans out into multiple notification actions.

### 5. Lifecycle state ownership guardrails
- [ ] Ensure notification consumers do not mutate interview lifecycle state outside source route/matcher ownership boundaries.
- [ ] Allow notification processing to read current interview state for send-time suppression/guard checks when needed, without re-owning lifecycle transitions.
- [ ] Ensure processing failures do not bypass lifecycle ownership defined in:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/api-routes.md`

### 6. Reliability and observability coverage
- [ ] Add/update reliability tests for:
  - repeated delivery of `interview.created`, `interview.cancelled`, and `interview.match.created`
  - producer enqueue failure behavior
  - transient retry behavior preserving idempotency guarantees
  - restart-safe dedupe/checkpoint behavior
- [ ] Add/update logs/metrics for:
  - events published
  - publish failures
  - events consumed
  - dedupe hits
  - reminder schedules created/suppressed
  - retries
  - terminal failures
- [ ] Keep observability expectations compatible with `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-6-reliability-tests-and-observability.md` and downstream Story 4.6 integration coverage.

## End Goal
Queue/runtime naming is reconciled with current notification ownership, producer hand-off failure behavior is explicit, reminder transport assumptions are locked, and notification processing remains durably idempotent under at-least-once delivery without violating lifecycle ownership.
