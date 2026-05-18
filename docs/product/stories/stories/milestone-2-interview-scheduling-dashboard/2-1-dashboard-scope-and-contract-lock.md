# Story 2.1: Dashboard Scope & Contract Lock

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Lock Dashboard implementation scope and data contracts to existing source-of-truth docs before UI/data work begins.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-6-interview-list-route-get-api-interviews.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/3-3-layout-integration.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/2-1-user-profile-quotas.md`

## What Needs to Be Done

### 1. Lock Dashboard scope to system design docs
- [x] Treat `docs/system/system-design/frontend-pages.md` as the source of truth for `/dashboard` behavior.
- [x] Treat the Story 2 split set (`2-1` through `2-4`) as the canonical Dashboard story scope and implementation breakdown.
- [x] Lock this ticket scope to only:
  - upcoming interviews
  - quick stats (credits + free Standard/AI balances)
- [x] Keep explicitly out of scope:
  - interview creation flow (`/interviews/new`)
  - cancellation actions
  - full interview history page behavior (`/interviews`)

### 2. Lock Milestone and MVP alignment
- [x] Confirm scope stays aligned with Milestone 2 definition in `docs/product/stories/milestones.md`.
- [x] Confirm scope stays aligned with MVP direction in `docs/product/system-pitch.md`.
- [x] If any mismatch exists between story text and source docs, update story/docs first so one source of truth exists before implementation.

### 3. Lock API/data contract dependencies for downstream subtasks
- [x] Treat `GET /api/account` and `GET /api/interviews?status=scheduled` as the only dashboard data routes (per `docs/system/system-design/frontend-pages.md` and `docs/system/system-design/api-routes.md`).
- [x] Treat `3-4-interview-shared-contracts-and-module-wiring.md` and `3-6-interview-list-route-get-api-interviews.md` as the dependency gates for finalized `GET /api/interviews` list shape.
- [x] If shared contracts/schemas do not yet match `docs/system/system-design/api-routes.md` response fields (including alias + scheduling fields), update story/docs/contracts first before UI implementation starts.

## End Goal
Dashboard scope is frozen to documented behavior and contracts, with dependency gates and out-of-scope boundaries explicitly defined so follow-up subtasks can execute predictably.
