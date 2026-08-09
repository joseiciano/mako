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
  - `event_type`: one of `interview.created | interview.cancelled | interview.match.created | interview.premium_booked`
  - `event_id`: unique event ID
  - `idempotency_key`: stable replay-safe key
  - `occurred_at`: ISO timestamp
  - `interview`: `{ id, scheduler_id, interviewer_id, type, mode, booking_channel, tier, status, scheduled_at }`
  - `participants`: `{ scheduler_user_id, interviewer_user_id | null }`
- [x] Lock envelope field naming to snake_case as the canonical internal queue contract (do not remap to camelCase within producer/consumer boundaries).

### 2. Required vs optional field semantics
- [x] Mark as always required:
  - `event_type`, `event_id`, `idempotency_key`, `occurred_at`, `interview.id`, `interview.scheduler_id`, `interview.type`, `interview.mode`, `interview.booking_channel`, `interview.tier`, `interview.status`, `interview.scheduled_at`, `participants.scheduler_user_id`
- [x] Enforce event-type requiredness matrix for participant-B identity:
  - `interview.created` (AI-led create path): `interview.interviewer_id` and `participants.interviewer_user_id` are nullable (not omitted).
  - `interview.match.created` (matcher-created peer-to-peer): `interview.interviewer_id` and `participants.interviewer_user_id` are required and non-null.
  - `interview.premium_booked` (premium first-to-claim): `interview.interviewer_id` and `participants.interviewer_user_id` are required and non-null; `interview.booking_channel` is required and must be `verified_interviewer`.
  - `interview.premium_booked` confirmations and reminders are owned by the Notification Orchestrator Worker (same consumer ownership as `interview.match.created`).
  - `interview.cancelled`: participant-B fields must mirror persisted interview shape at cancellation time (non-null for peer-to-peer rows, nullable for AI-led rows).
- [x] Keep role semantics aligned with:
  - matcher deterministic assignment in `docs/system/system-design/db-schemas.md`
  - create-path ownership in `docs/system/system-design/matching-tiers.md`
  - premium claim ownership in `docs/product/stories/stories/milestone-7-interviewer-verification-premium-matching/7-15-premium-slot-discovery-claim-api.md`

### 3. Canonical identity source and consistency rules
- [x] Treat `interview.scheduler_id` / `interview.interviewer_id` as canonical participant identity fields.
- [x] Treat `participants.scheduler_user_id` / `participants.interviewer_user_id` as derived mirrors for consumer ergonomics.
- [x] If both identity groups are present, require equality between `interview.*` and `participants.*` in validation/tests.
- [x] Keep queue-event field casing/source semantics independent from external API response serialization choices.

### 4. Producer ownership matrix by path/mode
- [x] Document and enforce producer ownership:
  - `interview.created` is emitted by `POST /api/interviews` only for Story 3 supported AI-led create paths.
  - `interview.match.created` is emitted only by matcher-created Standard peer-to-peer flow.
  - `interview.premium_booked` is emitted only by the premium first-to-claim transaction (`POST /api/premium/marketplace/claim`).
  - `interview.cancelled` is emitted by `POST /api/interviews/:id/cancel` only on the first successful `scheduled -> cancelled` transition.
  - Idempotent cancel retry (`cancelled -> cancelled`) must return success semantics without emitting a second cancellation event.
  - Consumer ownership for `interview.premium_booked` mirrors `interview.match.created`: the Notification Orchestrator Worker handles confirmations and reminders via per-effect checkpoints `interview.premium_booked:confirmation` and `interview.premium_booked:reminder`.
  - `interview.premium_booked` sends confirmations to both participants (`scheduler_id` and `interviewer_id`) and schedules a single 30-minute reminder before `scheduled_at` (only when status is `scheduled`).
  - Cancellation of a premium booking suppresses its pending reminder through the shared `interview.cancelled:suppression` checkpoint; no separate suppression path is required.
- [x] Keep direct peer-to-peer create through `POST /api/interviews` out of scope/unsupported for Milestone 2 Story 3 split.

### 5. Idempotency key stability rules
- [x] Define deterministic idempotency key strategy so retries/replays keep identical keys for the same lifecycle transition.
- [x] Ensure repeated processing/replay of the same emitted cancellation event cannot generate distinct keys for the same cancellation transition.
- [x] `interview.premium_booked` uses the deterministic idempotency key `premium-booking:{interview_id}` so retry/dispatch cannot duplicate the event.
- [x] Keep idempotency assumptions aligned with at-least-once queue delivery in:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/infrastructure/backend.md`

### 6. Contract validation coverage
- [x] Add/update contract tests validating:
  - required fields present
  - event-type requiredness matrix for participant-B identity
  - canonical vs derived identity field equality when both are present
  - producer ownership by event type/path
  - `interview.premium_booked` enforces `booking_channel = 'verified_interviewer'`
  - no second `interview.cancelled` emission for idempotent cancel retries
  - deterministic idempotency key generation

## End Goal
Notification event payloads are contract-stable, producer ownership is explicit by lifecycle path, and consumers can validate and dedupe events deterministically.
