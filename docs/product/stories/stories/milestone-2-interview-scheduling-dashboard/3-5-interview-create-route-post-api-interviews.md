# Story 3.5: Interview Create Route (`POST /api/interviews`)

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement authenticated AI-led interview creation with deterministic writes, explicit validation, and matcher-compatible alias behavior.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`

## What Needs to Be Done

### 1. Authentication and request validation
- [x] Require authenticated session and reject unauthenticated requests.
- [x] Validate request body with Zod using `docs/system/system-design/api-routes.md` contract.

### 2. Enforce create-path support boundaries
- [x] Accept AI-led create path for Story 3.
- [x] Reject unsupported direct peer-to-peer create path with explicit validation/business-rule errors.
- [x] Reject `interviewer_id` on direct create path for this story scope.

### 3. Deterministic write behavior
- [x] Implement deterministic `interviews` write behavior:
  - `status = 'scheduled'` at creation
  - `scheduler_id` from authenticated user
  - `scheduled_at` handling for ISO timestamp vs `'now'` based on resolved contract
  - effective `tier`/policy resolved server-side from account state for limit checks (not client input)
  - alias fields handled by explicit mode/tier rules (no implicit behavior)

### 4. Alias policy centralization
- [x] Define and centralize alias generation policy for `scheduler_alias` / `interviewer_alias` in one helper.
- [x] Ensure helper stays compatible with matcher dependency in `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-3-transactional-match-and-interview-write.md`.

### 5. Create-route test coverage
- [x] Add/update create-path tests for:
  - auth rejection
  - request schema validation
  - mode/account-policy matrix acceptance/rejection
  - deterministic write behavior
  - alias generation behavior

## End Goal
`POST /api/interviews` supports only Story 3-approved AI-led creation behavior with deterministic writes, explicit errors for unsupported paths, and shared alias policy compatibility.
