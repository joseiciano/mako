# Story 3.6: Interview List Route (`GET /api/interviews`)

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement participant-scoped interview listing with documented query params, deterministic ordering, and stable pagination behavior.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`

## What Needs to Be Done

### 1. Participant-scoped listing behavior
- [ ] Return interviews where authenticated user is a participant (`scheduler_id` or `interviewer_id`).
- [ ] Ensure response mapping follows shared contracts and API field mapping documented in `docs/system/system-design/api-routes.md`.

### 2. Query parameter support
- [ ] Support query params exactly as defined in `docs/system/system-design/api-routes.md`:
  - `status?`
  - `limit?`
  - `offset?`
- [ ] Reject invalid parameter values with clear validation errors.

### 3. Deterministic ordering and pagination
- [ ] Define one explicit stable ordering contract for list responses and document it in code/tests.
- [ ] Implement pagination behavior so repeated calls over unchanged data are deterministic.

### 4. List-route test coverage
- [ ] Add/update tests for:
  - participant scoping
  - query param validation and filtering
  - deterministic ordering
  - pagination determinism

### 5. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with dashboard dependencies in:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-1-dashboard-scope-and-contract-lock.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-3-dashboard-data-hooks-and-query-contracts.md`
- [ ] Confirm no discrepancy with role semantics documented in `docs/system/system-design/api-routes.md` and `docs/system/system-design/db-schemas.md`.
- [ ] If any discrepancy is found, update story/docs before implementation.

## End Goal
`GET /api/interviews` returns contract-aligned, participant-scoped data with deterministic ordering and pagination behavior that downstream dashboard/history consumers can rely on.
