# Story 4.2: Notification Event Contract and Producer Ownership

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define a stable normalized event contract and explicit producer ownership for notification queue hand-off.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
- `docs/system/system-design/matching-tiers.md`

## What Needs to Be Done

### 1. Define normalized event envelope (post-commit only)
- [ ] Define and use a normalized internal event payload contract for queue hand-off:
  - `event_type`: one of `interview.created | interview.cancelled | interview.match.created`
  - `event_id`: unique event ID
  - `idempotency_key`: stable replay-safe key
  - `occurred_at`: ISO timestamp
  - `interview`: `{ id, scheduler_id, interviewer_id, type, mode, tier, status, scheduled_at }`
  - `participants`: `{ scheduler_user_id, interviewer_user_id | null }`

### 2. Required vs optional field semantics
- [ ] Mark as required:
  - `event_type`, `event_id`, `idempotency_key`, `occurred_at`, `interview.id`, `interview.scheduler_id`, `interview.type`, `interview.mode`, `interview.tier`, `interview.status`, `interview.scheduled_at`, `participants.scheduler_user_id`
- [ ] Mark as nullable (not omitted):
  - `interview.interviewer_id`, `participants.interviewer_user_id` for AI-led flows
- [ ] Keep role semantics aligned with:
  - matcher deterministic assignment in `docs/system/system-design/db-schemas.md`
  - create-path ownership in `docs/system/system-design/matching-tiers.md`

### 3. Producer ownership matrix by path/mode
- [ ] Document and enforce producer ownership:
  - `interview.created` is emitted by `POST /api/interviews` only for Story 3 supported AI-led create paths.
  - `interview.match.created` is emitted only by matcher-created Standard peer-to-peer flow.
  - `interview.cancelled` is emitted by `POST /api/interviews/:id/cancel` when cancellation semantics allow event emission.
- [ ] Keep direct peer-to-peer create through `POST /api/interviews` out of scope/unsupported for Milestone 2 Story 3 split.

### 4. Idempotency key stability rules
- [ ] Define deterministic idempotency key strategy so retries/replays keep identical keys for the same lifecycle transition.
- [ ] Ensure repeated cancel retries cannot generate distinct keys for the same cancellation transition.
- [ ] Keep idempotency assumptions aligned with at-least-once queue delivery in:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/infrastructure/backend.md`

### 5. Contract validation coverage
- [ ] Add/update contract tests validating:
  - required fields present
  - nullable semantics for AI-led participants
  - producer ownership by event type/path
  - deterministic idempotency key generation

### 6. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-8-interview-post-commit-events-and-notification-contract.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md`
  - `docs/system/system-design/matching-tiers.md`
  - `docs/system/system-design/db-schemas.md`
  - `docs/system/system-design/api-routes.md`
- [ ] If any discrepancy is found, update story/docs before implementation.

## End Goal
Notification event payloads are contract-stable, producer ownership is explicit by lifecycle path, and consumers can validate and dedupe events deterministically.
