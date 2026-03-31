# Story 3.5: Interview Create Route (`POST /api/interviews`)

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement authenticated AI-led interview creation with deterministic writes, explicit validation, and matcher-compatible alias behavior.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`

## What Needs to Be Done

### 1. Authentication and request validation
- [ ] Require authenticated session and reject unauthenticated requests.
- [ ] Validate request body with Zod using `docs/system/system-design/api-routes.md` contract.

### 2. Enforce create-path support boundaries
- [ ] Accept AI-led create path for Story 3.
- [ ] Reject unsupported direct peer-to-peer create path with explicit validation/business-rule errors.
- [ ] Reject `interviewer_id` on direct create path for this story scope.

### 3. Deterministic write behavior
- [ ] Implement deterministic `interviews` write behavior:
  - `status = 'scheduled'` at creation
  - `scheduler_id` from authenticated user
  - `scheduled_at` handling for ISO timestamp vs `'now'` based on resolved contract
  - `tier` consumed as policy input for limit checks only
  - alias fields handled by explicit mode/tier rules (no implicit behavior)

### 4. Alias policy centralization
- [ ] Define and centralize alias generation policy for `scheduler_alias` / `interviewer_alias` in one helper.
- [ ] Ensure helper stays compatible with matcher dependency in `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-3-transactional-match-and-interview-write.md`.

### 5. Create-route test coverage
- [ ] Add/update create-path tests for:
  - auth rejection
  - request schema validation
  - mode/tier matrix acceptance/rejection
  - deterministic write behavior
  - alias generation behavior

### 6. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with `docs/system/system-design/matching-tiers.md` and matcher-owned Standard creation path.
- [ ] Confirm no discrepancy with lifecycle boundaries in `docs/system/system-design/state-management-lifecycle.md` and `docs/system/system-design/diagrams.md`.
- [ ] If any discrepancy is found, update story/docs before implementation.

## End Goal
`POST /api/interviews` supports only Story 3-approved AI-led creation behavior with deterministic writes, explicit errors for unsupported paths, and shared alias policy compatibility.
