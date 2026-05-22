# Story 4.3: Notification Transport, Reliability, and Idempotency

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Lock queue transport guarantees, producer hand-off failure policy, and durable idempotent processing boundaries for notification workflows.
**Status**: Completed

**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`
- `docs/system/system-design/state-management-lifecycle.md`

## What Needs to Be Done

### 1. Transport runtime reconciliation and boundary lock
- [x] Reconcile any legacy queue/worker/binding naming that still implies interview provisioning with the Milestone 2 notification-orchestration purpose across Terraform, worker entrypoints, backend bindings, and related docs.
- [x] Use the pre-provisioned queue/worker infrastructure from `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`, but keep Realtime/whiteboard provisioning out of this transport path.
- [x] Keep transport behavior strictly post-commit hand-off for `interview.created`, `interview.cancelled`, and `interview.match.created`, never inside route or matcher transaction scope.

Keep Realtime/whiteboard provisioning out of this transport path. Keep Cloudflare Workflow ownership separate for in-session lifecycle timers.

### 2. Producer hand-off failure policy
- [x] Define explicit expected behavior when a lifecycle event cannot be enqueued after the source database commit has already succeeded.
- [x] Unify producer-side failure semantics across direct interview create/cancel paths and matcher-created paths so queue publish failures are handled consistently.
- [x] Define required recovery/visibility behavior for failed enqueue attempts (for example: structured logging, retry/repair path, and operator visibility) so committed lifecycle events are not silently lost.
- [x] Ensure the durable outbox event for `interview.created` reflects the actual persisted interview record (including resolved tier and other policy-dependent fields) rather than pre-transaction guesswork.

### 3. Delivery semantics, retry classification, and reminder transport
- [x] Keep delivery assumptions explicit:
  - at-least-once delivery
  - consumer-side idempotency keyed by `idempotency_key` as the canonical dedupe key
  - safe retry behavior for transient failures
- [x] Define transient vs terminal consumer failures and the required retry/ack behavior for each category.
- [x] Lock the transport used for 30-minute reminder timing so Stories 4.4 and 4.5 have a stable runtime assumption (for example: delayed queue delivery or persisted reminder scheduling), and keep it separate from Cloudflare Workflow ownership used for in-session lifecycle timers.
- [x] Ensure failed processing paths do not silently drop notification or reminder work.
- [x] Worker queue handler uses real Cloudflare `Message`/`MessageBatch` interfaces with per-message `ack()`/`retry()`, and the scheduled handler dispatches via the bound `NOTIFICATION_QUEUE` producer.

### 4. Durable idempotency and processing checkpoints
- [x] Ensure replay/retry of the same logical event does not produce duplicate downstream side effects for confirmation delivery, reminder scheduling, or cancellation-side suppression.
- [x] Ensure replayed/duplicate delivery of the same emitted `interview.cancelled` event does not produce duplicate reminder suppression/cancellation actions.
- [x] Persist dedupe/checkpoint state in a durable store so idempotency remains deterministic across worker restarts, retries, and redeploys.
- [x] Keep `idempotency_key` as the canonical root dedupe key while defining per-side-effect checkpoints when one event fans out into multiple notification actions:
  - `interview.created` — `interview.created:confirmation` (confirmation transport) and `interview.created:reminder` (reminder scheduling or suppression)
  - `interview.match.created` — `interview.match.created:confirmation` and `interview.match.created:reminder`
  - `interview.cancelled` — `interview.cancelled:suppression` (reminder suppression)
  - `reminder.due` — `reminder.due:{idempotency_key}` (delivery or suppression outcome)

### 5. Lifecycle state ownership guardrails
- [x] Ensure notification consumers do not mutate interview lifecycle state outside source route/matcher ownership boundaries.
- [x] Allow notification processing to read current interview state for send-time suppression/guard checks when needed, without re-owning lifecycle transitions.
- [x] Ensure processing failures do not bypass lifecycle ownership defined in:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/api-routes.md`

### 6. Reliability and observability coverage
- [x] Add/update reliability tests for:
  - repeated delivery of `interview.created`, `interview.cancelled`, and `interview.match.created`
  - producer enqueue failure behavior
  - transient retry behavior preserving idempotency guarantees
  - restart-safe dedupe/checkpoint behavior
- [x] Add/update logs/metrics for:
  - events published
  - publish failures
  - events consumed
  - dedupe hits
  - reminder schedules created/suppressed
  - retries
  - terminal failures
- [x] Keep observability expectations compatible with `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-6-reliability-tests-and-observability.md` and downstream Story 4.6 integration coverage.

## End Goal
Queue/runtime naming is reconciled with current notification ownership, producer hand-off failure behavior is explicit, reminder transport assumptions are locked, and notification processing remains durably idempotent under at-least-once delivery without violating lifecycle ownership.
