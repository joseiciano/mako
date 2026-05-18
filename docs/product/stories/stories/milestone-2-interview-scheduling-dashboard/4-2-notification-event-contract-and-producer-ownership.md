# Story 4.2: Notification Event Contract and Producer Ownership

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define a stable normalized event contract and explicit producer ownership for notification queue hand-off.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
- `docs/system/system-design/matching-tiers.md`

## What Needs to Be Done

### 1. Define normalized event envelope (post-commit only)
- [x] Define and use a normalized internal event payload contract for queue hand-off:
  - `event_type`: one of `interview.created | interview.cancelled | interview.match.created`
  - `event_id`: unique event ID
  - `idempotency_key`: stable replay-safe key
  - `occurred_at`: ISO timestamp
  - `interview`: `{ id, scheduler_id, interviewer_id, type, mode, tier, status, scheduled_at }`
  - `participants`: `{ scheduler_user_id, interviewer_user_id | null }`
- [x] Lock envelope field naming to snake_case as the canonical internal queue contract (do not remap to camelCase within producer/consumer boundaries).

### 2. Required vs optional field semantics
- [x] Mark as always required:
  - `event_type`, `event_id`, `idempotency_key`, `occurred_at`, `interview.id`, `interview.scheduler_id`, `interview.type`, `interview.mode`, `interview.tier`, `interview.status`, `interview.scheduled_at`, `participants.scheduler_user_id`
- [x] Enforce event-type requiredness matrix for participant-B identity:
  - `interview.created` (AI-led create path): `interview.interviewer_id` and `participants.interviewer_user_id` are nullable (not omitted).
  - `interview.match.created` (matcher-created peer-to-peer): `interview.interviewer_id` and `participants.interviewer_user_id` are required and non-null.
  - `interview.cancelled`: participant-B fields must mirror persisted interview shape at cancellation time (non-null for peer-to-peer rows, nullable for AI-led rows).
- [x] Keep role semantics aligned with:
  - matcher deterministic assignment in `docs/system/system-design/db-schemas.md`
  - create-path ownership in `docs/system/system-design/matching-tiers.md`

### 3. Canonical identity source and consistency rules
- [x] Treat `interview.scheduler_id` / `interview.interviewer_id` as canonical participant identity fields.
- [x] Treat `participants.scheduler_user_id` / `participants.interviewer_user_id` as derived mirrors for consumer ergonomics.
- [x] If both identity groups are present, require equality between `interview.*` and `participants.*` in validation/tests.
- [x] Keep queue-event field casing/source semantics independent from external API response serialization choices.

### 4. Producer ownership matrix by path/mode
- [x] Document and enforce producer ownership:
  - `interview.created` is emitted by `POST /api/interviews` only for Story 3 supported AI-led create paths.
  - `interview.match.created` is emitted only by matcher-created Standard peer-to-peer flow.
  - `interview.cancelled` is emitted by `POST /api/interviews/:id/cancel` only on the first successful `scheduled -> cancelled` transition.
  - Idempotent cancel retry (`cancelled -> cancelled`) must return success semantics without emitting a second cancellation event.
- [x] Keep direct peer-to-peer create through `POST /api/interviews` out of scope/unsupported for Milestone 2 Story 3 split.

### 5. Idempotency key stability rules
- [x] Define deterministic idempotency key strategy so retries/replays keep identical keys for the same lifecycle transition.
- [x] Ensure repeated processing/replay of the same emitted cancellation event cannot generate distinct keys for the same cancellation transition.
- [x] Keep idempotency assumptions aligned with at-least-once queue delivery in:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/infrastructure/backend.md`

### 6. Contract validation coverage
- [x] Add/update contract tests validating:
  - required fields present
  - event-type requiredness matrix for participant-B identity
  - canonical vs derived identity field equality when both are present
  - producer ownership by event type/path
  - no second `interview.cancelled` emission for idempotent cancel retries
  - deterministic idempotency key generation
  - `occurred_at` stability using persisted transition timestamps (`created_at` for created, `updated_at` for cancelled)
  - async publish boundary is awaited so failures propagate

## Implementation Notes

- `publishNotification` boundary is typed as `Promise<void> | void` to support both sync test stubs and real async queue hand-offs.
- The service **awaits** `publishNotification` so that publish failures propagate as rejected service calls rather than being silently dropped.
- Concrete runtime queue bindings (e.g., Cloudflare Queue producer wiring) and retry/recovery semantics for failed post-commit transport are explicitly out of scope here and owned by Story 4.3.
- `occurred_at` is stabilized using persisted transition timestamps:
  - `interview.created`: uses the committed `interview.created_at`
  - `interview.cancelled`: uses the committed `interview.updated_at` after the cancellation update
- This prevents clock skew between the DB commit and the event emission from leaking into the event envelope.

## End Goal
Notification event payloads are contract-stable, producer ownership is explicit by lifecycle path, and consumers can validate and dedupe events deterministically.
