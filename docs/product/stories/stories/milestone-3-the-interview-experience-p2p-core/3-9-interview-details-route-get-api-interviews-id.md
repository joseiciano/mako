# Story 3.9: Interview Details Route (`GET /api/interviews/:id`)

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement participant-scoped interview details retrieval so interview details/session/feedback pages can read canonical interview state. Core `GET /api/interviews/:id` API route shipped early in Milestone 2; Story 3.9 completes the read-consumer page rollout while start/end/timer lifecycle integration remains owned by dedicated Milestone 3 lifecycle stories.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`

## What Needs to Be Done

### 1. Route ownership and participant authorization
- [x] Implement `GET /api/interviews/:id` in backend interview module/controller wiring.
- [x] Require authenticated participant ownership (`scheduler_id` or `interviewer_id`) and reject non-participants.

### 2. Contract and response mapping
- [x] Return interview details shape aligned with `docs/system/system-design/api-routes.md` and interview schema fields from `docs/system/system-design/db-schemas.md`.
- [x] Keep API field naming conventions consistent with existing interview route contracts.

### 3. Lifecycle and dependency alignment
- [x] Complete consumer rollout for Interview Details (`/interviews/:id`), Interview Session (`/interviews/:id/session`), and Post-Interview Feedback (`/interviews/:id/feedback`) pages that depend on this route in `docs/system/system-design/frontend-pages.md`.
- [x] Keep join-time provisioning ownership separate at `POST /api/interviews/:id/provision`; related start/end/timer lifecycle integration remains owned by dedicated Milestone 3 lifecycle stories.

### 4. Route tests
- [x] Add/update backend tests for auth rejection, participant authorization, missing interview handling, and response contract shape.

## End Goal
Core `GET /api/interviews/:id` route is live, participant-safe, and consumed by the details/session/feedback frontend pages without expanding provisioning ownership beyond the dedicated provision route.
