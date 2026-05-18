# Story 3.6: Interview List Route (`GET /api/interviews`)

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement participant-scoped interview listing with documented query params, deterministic ordering, and stable pagination behavior.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`

## What Needs to Be Done

### 1. Participant-scoped listing behavior
- [x] Return interviews where authenticated user is a participant (`scheduler_id` or `interviewer_id`).
- [x] Ensure response mapping follows shared contracts and API field mapping documented in `docs/system/system-design/api-routes.md`.

### 2. Query parameter support
- [x] Support query params exactly as defined in `docs/system/system-design/api-routes.md`:
  - `status?`
  - `limit?`
  - `offset?`
- [x] Reject invalid parameter values with clear validation errors.

### 3. Deterministic ordering and pagination
- [x] Define one explicit stable ordering contract for list responses and document it in code/tests.
- [x] Implement pagination behavior so repeated calls over unchanged data are deterministic.

### 4. List-route test coverage
- [x] Add/update tests for:
  - participant scoping
  - query param validation and filtering
  - deterministic ordering
  - pagination determinism

## End Goal
`GET /api/interviews` returns contract-aligned, participant-scoped data with deterministic ordering and pagination behavior that downstream dashboard/history consumers can rely on.
