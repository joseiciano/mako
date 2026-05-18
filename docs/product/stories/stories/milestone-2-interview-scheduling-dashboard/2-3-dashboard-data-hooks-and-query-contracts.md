# Story 2.3: Dashboard Data Hooks & Query Contracts

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement Dashboard data-fetching hooks with TanStack Query and documented API contracts, preserving existing session transport and schema validation patterns.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-1-dashboard-scope-and-contract-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-2-dashboard-route-architecture-and-auth-integration.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/2-1-user-profile-quotas.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-6-interview-list-route-get-api-interviews.md`

## What Needs to Be Done

### 1. Implement dashboard query hooks from documented APIs
- [x] Reuse account fetch/query pattern from `apps/frontend/src/hooks/use-account.ts` for `GET /api/account`.
- [x] Add a dedicated interview list hook in `apps/frontend/src/hooks/` for dashboard upcoming data via `GET /api/interviews?status=scheduled`.
- [x] Keep query keys explicit and stable so cache behavior is deterministic.

### 2. Enforce TanStack Query-only server state flow
- [x] Use TanStack Query for all dashboard server-state reads.
- [x] Do not implement manual `useEffect` + local loading orchestration for dashboard data fetching.
- [x] Keep loading/error/empty/populated branching driven by query state in the smart component.

### 3. Enforce documented schema contracts and payload parsing
- [x] Parse and validate API payloads with Zod-backed shared schemas where available.
- [x] For `GET /api/interviews`, use the documented response fields from `docs/system/system-design/api-routes.md` (including alias + scheduling fields).
- [x] If shared contracts are missing or diverge from source-of-truth docs, update docs/story/contracts first before implementing consumer logic.

### 4. Keep session/auth transport behavior consistent
- [x] Follow the exact session/auth transport pattern currently used by `apps/frontend/src/hooks/use-account.ts` (do not introduce a second dashboard-only transport path).
- [x] Keep auth behavior aligned with existing frontend auth integration from:
  - `docs/product/stories/stories/milestone-1-foundation-authentication/3-3-layout-integration.md`
  - `docs/product/stories/stories/milestone-1-foundation-authentication/4-2-better-auth-frontend-foundation.md`
- [x] Treat Story 4.1 (`docs/product/stories/stories/milestone-1-foundation-authentication/4-1-better-auth-backend.md`) as the backend normalization gate before changing shared frontend hook transport behavior.
- [x] Do not introduce a dashboard-specific or parallel auth/session transport path.

### 5. Add dashboard data-hook test coverage
- [x] Add tests for scheduled interview list hook success path (`status=scheduled` response).
- [x] Add tests for list hook error path and error-message handling.
- [x] Add tests validating response parsing with shared schemas/contracts.

## End Goal
Dashboard data dependencies are implemented with consistent hooks and TanStack Query patterns, using documented contracts and existing auth/session transport, with explicit hook-level test coverage.
