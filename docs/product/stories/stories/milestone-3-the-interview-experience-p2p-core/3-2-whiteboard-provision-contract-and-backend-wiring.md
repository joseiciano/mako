# Story 3.2: Whiteboard Provision Contract and Backend Wiring

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement backend/shared contract wiring so join-time provisioning returns and persists collaborative whiteboard session data.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-1-whiteboard-scope-and-contract-boundaries.md`

## What Needs to Be Done

### 1. Shared interview provision contracts
- [ ] Add/update shared request/response schemas and types for `POST /api/interviews/:id/provision` in `packages/shared/src/interviews.ts`.
- [ ] Export new interview contract types from `packages/shared/src/index.ts`.
- [ ] Keep contract fields aligned to `docs/system/system-design/api-routes.md` and `docs/system/system-design/db-schemas.md`.

### 2. Backend interview module implementation for provisioning
- [ ] Implement/update interview backend module files in `packages/shared-backend/src/interviews/`:
  - `interview-repository.ts`
  - `interview-service.ts`
  - `interview-controller.ts`
  - `types.ts`
  - `index.ts`
- [ ] Register interview provisioning route wiring in `apps/backend-rest/src/index.ts`.

### 3. Join-time persistence and transition safety
- [ ] In provisioning flow, persist generated values to `interviews` row fields (`realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`).
- [ ] Keep provisioning as runtime join phase and do not introduce a new persisted interview `status` for provisioning.
- [ ] Enforce participant-only access for provisioning and reject non-participant requests.

### 4. Backend tests for provisioning contract and writes
- [ ] Keep this story's tests focused on baseline route/module correctness; expanded resilience/observability coverage is owned by Story 3.5.
- [ ] Add/update backend tests (module and route-level) for:
  - auth/authorization behavior
  - contract response shape
  - persistence of whiteboard/realtime fields
  - baseline idempotent behavior for repeated provision calls on the same interview

## End Goal
The backend provisioning route is fully wired and test-covered, returning a stable whiteboard-ready contract while preserving lifecycle and persistence boundaries.
