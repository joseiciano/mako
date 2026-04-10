# Story: Session Lifecycle

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement deterministic session lifecycle controls for join/start/timer/end behavior with persisted state transitions and workflow-backed timer continuity.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-2-whiteboard-provision-contract-and-backend-wiring.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-3-whiteboard-session-route-and-ui-shell.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/real-time-communication.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/diagrams.md`
- `docs/system/system-design/db-schemas.md`
- `docs/system/system-design/concurrency-data-integrity.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/matching-tiers.md`
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`

## What Needs to Be Done

### 1. Lifecycle route and documentation contract lock
- [ ] Reconcile lifecycle controls in source-of-truth docs before implementation by documenting explicit session action routes in `docs/system/system-design/api-routes.md` for:
  - `POST /api/interviews/:id/start`
  - `POST /api/interviews/:id/end`
- [ ] Update `docs/system/system-design/frontend-pages.md` so `/interviews/:id/session` explicitly lists lifecycle control/timer data dependencies in addition to existing join provisioning dependencies.
- [ ] Keep join-time provisioning ownership unchanged at `POST /api/interviews/:id/provision`; do not add a separate persisted provisioning status (aligned with `docs/system/system-design/state-management-lifecycle.md`).
- [ ] Keep Milestone 3 scope focused on P2P session lifecycle controls; AI chat guidance route ownership remains in Milestone 4 (`POST /api/interviews/:id/ai-chat`).

### 2. Backend lifecycle transition implementation
- [ ] Add/update shared request/response contracts for lifecycle action routes in `packages/shared/src/interviews.ts` and export through `packages/shared/src/index.ts`.
- [ ] Implement lifecycle action handling in interview backend modules under `packages/shared-backend/src/interviews/` (controller/service/repository/types/index) and register route wiring in `apps/backend-rest/src/index.ts`.
- [ ] Enforce participant-only authorization for start/end actions (non-participants rejected with explicit errors).
- [ ] Enforce transition matrix with explicit deterministic behavior:
  - `scheduled -> ongoing` on valid `start`
  - `ongoing -> ongoing` idempotent retry semantics for repeated `start`
  - `ongoing -> completed` on valid `end` (manual completion)
  - `completed -> completed` idempotent retry semantics for repeated `end`
  - reject invalid transitions without state mutation (`cancelled -> start|end`, `completed -> start`, `scheduled -> end`)
- [ ] Keep persisted interview status domain unchanged (`scheduled`, `ongoing`, `completed`, `cancelled`) and consistent with `docs/system/system-design/db-schemas.md`.
- [ ] Keep matcher/tier ownership unchanged from `docs/system/system-design/matching-tiers.md` (this story must not alter how P2P sessions are created).

### 3. Workflow timer orchestration and state persistence
- [ ] Trigger Cloudflare Workflow timer orchestration from lifecycle start path (not from matcher, not from join provisioning route).
- [ ] Enforce workflow start idempotency for repeated/concurrent start attempts on the same interview so only one active timer orchestration exists.
- [ ] Implement 60-minute timer behavior with 5-minute warning emission semantics aligned with `docs/system/system-design/diagrams.md` and `docs/infrastructure/backend.md`.
- [ ] Ensure completion by timer expiration transitions interview state to `completed` with atomic persistence and idempotent retry safety.
- [ ] Ensure manual `end` path safely converges with timer completion path (no double-complete race, no conflicting terminal writes).
- [ ] Ensure timer continuity after refresh/reconnect is sourced from backend/workflow state, not a client-only local countdown.

### 4. Frontend session lifecycle controls and UX states
- [ ] Extend `/interviews/:id/session` route implementation in `apps/frontend/src/routes/` with explicit lifecycle controls (`Start Session`, `End Session`) and timer display.
- [ ] Keep smart/dumb boundaries aligned with existing frontend patterns and `docs/coding/frontend-instructions.md`:
  - smart layer owns mutations/query orchestration
  - dumb layer renders lifecycle/timer states
- [ ] Keep frontend state ownership aligned with `docs/system/system-design/state-management-lifecycle.md` and `docs/infrastructure/frontend.md`:
  - TanStack Query for server-backed lifecycle/timer state
  - TanStack Store for local UI state only
- [ ] Implement deterministic UI gating:
  - show `Start Session` only when participant is joined and interview is `scheduled`
  - show in-session timer + `End Session` controls only when interview is `ongoing`
  - show terminal completed/cancelled UX states with no further lifecycle actions
- [ ] Handle lifecycle failures/retries with explicit user feedback (including duplicate-click/in-flight protection).

### 5. Concurrency, testing, and observability
- [ ] Apply atomic SQL transition safeguards (per `docs/system/system-design/concurrency-data-integrity.md`) so concurrent participant actions cannot produce conflicting lifecycle state.
- [ ] Add/update backend tests for:
  - participant authorization
  - valid vs invalid transition matrix
  - idempotent repeated start/end calls
  - concurrent start/end race handling
  - workflow trigger-once behavior
- [ ] Add/update frontend route/component tests for:
  - lifecycle control visibility by status
  - timer rendering and continuity on refresh/reconnect
  - warning/terminal state UX
  - retry/error behavior for start/end actions
- [ ] Add structured logs/telemetry points for lifecycle actions (`start_requested`, `start_succeeded`, `end_requested`, `end_succeeded`, `timer_warning`, `timer_completed`) without leaking sensitive provision credentials.

## Implementation Notes
- Session provisioning remains a join-time runtime phase (`POST /api/interviews/:id/provision`) and is not itself a lifecycle status.
- Queue-driven post-commit orchestration boundaries from Milestone 2 remain unchanged; this story owns in-session lifecycle control + timer orchestration only.
- Recording persistence, screenshot pipelines, and AI feedback report generation remain follow-up scope in Milestone 5.
- If implementation requires any new persisted lifecycle metadata fields, define them first in `docs/system/system-design/db-schemas.md` and add raw SQL migration(s) in `packages/shared-backend/migrations/*.sql` before route implementation.

## End Goal
Participants can reliably join and start an interview session, see an accurate workflow-backed timer with reconnect continuity, and end the session manually or automatically at timeout, with deterministic persisted lifecycle transitions and no drift from system design/infrastructure boundaries.
