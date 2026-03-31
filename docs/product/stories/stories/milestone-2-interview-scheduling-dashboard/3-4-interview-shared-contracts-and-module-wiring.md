# Story 3.4: Interview Shared Contracts and Module Wiring

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement shared interview contracts and backend module wiring (controller/service/repository) so Story 3 routes are consistently integrated.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-3-interview-db-schema-migrations-and-index-readiness.md`

## What Needs to Be Done

### 1. Implement interview backend module files
- [ ] Implement interview modules in shared-backend following existing account layering patterns:
  - `packages/shared-backend/src/interviews/interview-repository.ts`
  - `packages/shared-backend/src/interviews/interview-service.ts`
  - `packages/shared-backend/src/interviews/interview-controller.ts`
  - `packages/shared-backend/src/interviews/types.ts`
  - `packages/shared-backend/src/interviews/index.ts`

### 2. Implement shared route schemas/types
- [ ] Define shared request/response schemas and types in `packages/shared/src/interviews.ts`.
- [ ] Export interview contracts from `packages/shared/src/index.ts`.
- [ ] Keep shared schemas aligned to route contracts in `docs/system/system-design/api-routes.md`.

### 3. Register backend route wiring
- [ ] Register the interview controller in `apps/backend-rest/src/index.ts`.
- [ ] Ensure create/list/cancel route registration remains isolated to Story 3 scope.

### 4. Add module wiring tests
- [ ] Add/update controller/service/repository/schema integration tests as modules are introduced.
- [ ] Verify route-level request/response validation uses shared schemas consistently.

## End Goal
Interview CRUD shared contracts and backend module wiring are in place and test-covered, enabling route behavior implementation with consistent layering and schema boundaries.
