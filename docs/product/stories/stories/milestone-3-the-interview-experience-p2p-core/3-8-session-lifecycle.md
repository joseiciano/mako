# Story 3.8: Session Lifecycle Contract and Backend Transitions

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement deterministic backend lifecycle contracts and persisted start/end transitions for P2P interview sessions.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-2-whiteboard-provision-contract-and-backend-wiring.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-6-real-time-communication.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/db-schemas.md`
- `docs/system/system-design/matching-tiers.md`

## What Needs to Be Done

### 1. Lock lifecycle route contracts in source-of-truth docs
- [x] Reconcile lifecycle controls in `docs/system/system-design/api-routes.md` before implementation by documenting explicit session action routes:
  - `POST /api/interviews/:id/start`
  - `POST /api/interviews/:id/end`
- [x] Keep join-time provisioning ownership unchanged at `POST /api/interviews/:id/provision`; do not add separate persisted provisioning status.
- [x] Keep Milestone 3 scope focused on P2P session lifecycle controls; AI chat route ownership remains in Milestone 4 (`POST /api/interviews/:id/ai-chat`).

### 2. Implement shared contracts and backend route wiring
- [x] Add/update shared request/response contracts for lifecycle action routes in `packages/shared/src/interviews.ts` and export through `packages/shared/src/index.ts`.
- [x] Implement lifecycle action handling in interview backend modules under `packages/shared-backend/src/interviews/`:
  - `interview-repository.ts`
  - `interview-service.ts`
  - `interview-controller.ts`
  - `types.ts`
  - `index.ts`
- [x] Register lifecycle route wiring in `apps/backend-rest/src/index.ts`.
- [x] Enforce participant-only authorization for start/end actions and reject non-participants with explicit errors.

### 3. Enforce deterministic persisted transition matrix
- [x] Enforce transition matrix with explicit behavior:
  - `scheduled -> ongoing` on valid `start`
  - `ongoing -> ongoing` idempotent retry semantics for repeated `start`
  - `ongoing -> completed` on valid `end`
  - `completed -> completed` idempotent retry semantics for repeated `end`
  - reject invalid transitions without state mutation (`cancelled -> start|end`, `completed -> start`, `scheduled -> end`)
- [x] Keep persisted interview status domain unchanged (`scheduled`, `ongoing`, `completed`, `cancelled`) and aligned with `docs/system/system-design/db-schemas.md`.
- [x] Keep matcher/tier ownership unchanged from `docs/system/system-design/matching-tiers.md`.

### 4. Add baseline backend coverage for lifecycle actions
- [x] Add/update backend tests for:
  - participant authorization
  - valid vs invalid transition matrix
  - idempotent repeated `start`/`end` calls
  - no state mutation on rejected transitions

## Implementation Notes
- Workflow timer orchestration moves to Story 3.10.
- Frontend lifecycle controls and timer rendering move to Story 3.11.
- Concurrency hardening and lifecycle observability move to Story 3.12.
- Recording persistence, screenshot pipelines, and AI feedback report generation remain follow-up scope in Milestone 5.

## End Goal
Lifecycle start/end routes exist with deterministic persisted status transitions, stable shared contracts, and no drift from documented system design boundaries.
