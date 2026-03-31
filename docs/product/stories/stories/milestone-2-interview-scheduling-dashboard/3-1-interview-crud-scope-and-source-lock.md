# Story 3.1: Interview CRUD Scope and Source Lock

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Freeze Story 3 scope to the exact interview CRUD routes and lock lifecycle boundaries to existing system design documents before implementation starts.
**Status**: Todo

## What Needs to Be Done

### 1. Route scope lock
- [ ] Lock this story split to exactly these routes from `docs/system/system-design/api-routes.md`:
  - `POST /api/interviews`
  - `GET /api/interviews`
  - `POST /api/interviews/:id/cancel`
- [ ] Keep these routes explicitly out of scope:
  - `GET /api/interviews/:id`
  - `POST /api/interviews/:id/provision`

### 2. Follow-up ownership for out-of-scope routes
- [ ] Record explicit follow-up story file references for out-of-scope route ownership used by lifecycle pages in `docs/system/system-design/frontend-pages.md`:
  - `GET /api/interviews/:id` (Interview Details / Feedback dependencies)
  - `POST /api/interviews/:id/provision` (Interview Session join/provision dependency)
- [ ] Ensure route/story tracking in `docs/system/system-design/frontend-pages.md` stays aligned with these follow-up references.

### 3. Lifecycle boundary lock
- [ ] Keep interview creation/cancellation in this story as data-state management only.
- [ ] Keep realtime session provisioning as join-time behavior through `POST /api/interviews/:id/provision` per:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/api-routes.md`

### 4. Route contract guardrails
- [ ] Add/update route-contract tests so only the in-scope routes are implemented by this story split.
- [ ] Add/update contract checks to prevent accidental inclusion of details/provision route logic in these subtasks.

### 5. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with previous Milestone 2 lifecycle boundaries in:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-1-matcher-scope-and-dependencies.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/notification-service.md`
- [ ] Confirm no discrepancy with `docs/infrastructure/backend.md` and `docs/infrastructure/management.md` runtime boundaries.
- [ ] If any discrepancy is found, update story/docs before implementation.

## End Goal
Story 3 implementation scope is frozen to create/list/cancel only, with lifecycle boundaries and route ownership explicitly locked to system design documentation so no hidden scope creeps into implementation.
