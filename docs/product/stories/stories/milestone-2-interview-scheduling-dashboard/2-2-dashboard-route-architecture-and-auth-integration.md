# Story 2.2: Dashboard Route Architecture & Auth Integration

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement Dashboard page architecture under authenticated routing using the smart-dumb component pattern while preserving existing auth-flow behavior.
**Status**: In-Review
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-1-dashboard-scope-and-contract-lock.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/3-3-layout-integration.md`

## What Needs to Be Done

### 1. Keep authenticated route entrypoint and guard behavior
- [x] Keep route entrypoint at `apps/frontend/src/routes/_authenticated.dashboard.tsx`.
- [x] Ensure route remains under the existing authenticated layout and route guard chain introduced in Story 3.3.
- [x] Do not add dashboard-specific auth guard logic that diverges from `_authenticated` routing behavior.

### 2. Refactor route page to smart-dumb structure
- [x] Create `apps/frontend/src/routes/dashboard/dashboard-smart.tsx` for data orchestration/auth-aware page logic.
- [x] Create `apps/frontend/src/routes/dashboard/dashboard-dumb.tsx` for rendering-only logic.
- [x] Update `apps/frontend/src/routes/_authenticated.dashboard.tsx` to import/render the smart component only.
- [x] Keep responsibilities clear:
  - smart component handles hooks, query state branching, navigation decisions
  - dumb component handles JSX rendering and presentational composition only

### 3. Keep architecture aligned with frontend conventions
- [x] Follow smart-dumb structure guidance in `docs/coding/frontend-instructions.md`.
- [x] Keep implementation aligned with frontend stack constraints in `docs/infrastructure/frontend.md`.
- [x] Keep files small and focused to match repository coding standards.

### 4. Add route-level integration confidence tests
- [x] Add route-level coverage verifying `_authenticated.dashboard` remains under the authenticated route guard chain.
- [x] Add coverage verifying no dashboard-specific auth guard divergence was introduced.

## End Goal
The Dashboard route is correctly wired under authenticated routing with a clean smart-dumb split, no deviation from established auth guard behavior, and route-level integration confidence coverage.
