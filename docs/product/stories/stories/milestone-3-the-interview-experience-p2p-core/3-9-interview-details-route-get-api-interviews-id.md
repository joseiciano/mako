# Story 3.9: Interview Details Route (`GET /api/interviews/:id`)

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement participant-scoped interview details retrieval so interview details/session/feedback pages can read canonical interview state without expanding Milestone 2 CRUD boundaries.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`

## What Needs to Be Done

### 1. Route ownership and participant authorization
- [ ] Implement `GET /api/interviews/:id` in backend interview module/controller wiring.
- [ ] Require authenticated participant ownership (`scheduler_id` or `interviewer_id`) and reject non-participants.

### 2. Contract and response mapping
- [ ] Return interview details shape aligned with `docs/system/system-design/api-routes.md` and interview schema fields from `docs/system/system-design/db-schemas.md`.
- [ ] Keep API field naming conventions consistent with existing interview route contracts.

### 3. Lifecycle and dependency alignment
- [ ] Keep this route as read-only lifecycle data access for Interview Details (`/interviews/:id`), Interview Session (`/interviews/:id/session`), and Post-Interview Feedback (`/interviews/:id/feedback`) dependencies in `docs/system/system-design/frontend-pages.md`.
- [ ] Keep join-time provisioning ownership separate at `POST /api/interviews/:id/provision`.

### 4. Route tests
- [ ] Add/update backend tests for auth rejection, participant authorization, missing interview handling, and response contract shape.

## End Goal
`GET /api/interviews/:id` is explicitly owned by a dedicated follow-up story and delivered as a participant-safe lifecycle data route, without scope drift into provisioning or Milestone 2 CRUD boundaries.
