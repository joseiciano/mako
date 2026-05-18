# Story 3.7: Interview Cancel Route (`POST /api/interviews/:id/cancel`)

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement participant-authorized, lifecycle-valid, and idempotent interview cancellation with atomic state updates.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/diagrams.md`
**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

## What Needs to Be Done

### 1. Ownership and authorization checks
- [x] Enforce participant ownership checks so only users tied to the interview can cancel it.
- [x] Reject unauthorized cancellation attempts with explicit error responses.

### 2. Valid-state cancellation rules
- [x] Enforce cancellation transitions exactly as defined in `docs/system/system-design/state-management-lifecycle.md`:
  - allowed: `scheduled -> cancelled`
  - idempotent retry: `cancelled -> cancelled` (success semantics, no extra mutation)
  - rejected: `ongoing|completed -> cancelled`
  - note: join-time provisioning is a runtime phase, not a persisted interview `status` value
- [x] Document and test allowed, idempotent, and rejected transition behavior in route/service logic.

### 3. Atomic cancellation write behavior
- [x] Perform cancellation as an atomic DB update:
  - set `status = 'cancelled'`
  - mutate `updated_at`
- [x] Ensure state mutation cannot partially apply.

### 4. Idempotency behavior
- [x] Define explicit idempotent retry behavior for repeated cancel requests against the same interview.
- [x] Ensure retries do not corrupt interview state.

### 5. Cancel-route test coverage
- [x] Add/update tests for:
  - participant ownership checks (scheduler and interviewer)
  - valid and invalid state transitions
  - atomic update behavior
  - idempotent retry semantics

## Implementation Notes
- Non-participant access is surfaced as a not-found response to avoid leaking interview existence.
- Repeated cancellation against an already-cancelled interview is an idempotent success (no extra mutation).

## End Goal
`POST /api/interviews/:id/cancel` is participant-safe, lifecycle-valid, atomic, and idempotent, with explicit behavior validated by route/service tests.
