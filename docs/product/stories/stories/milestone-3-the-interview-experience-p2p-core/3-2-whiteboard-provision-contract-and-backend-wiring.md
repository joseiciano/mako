# Story 3.2: Interview Session Provisioning Contract and Backend Wiring

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement canonical backend/shared join-time provisioning flow for Cloudflare Realtime credentials and Excalidraw collaboration room data used by interview sessions.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-1-whiteboard-scope-and-contract-boundaries.md`

## What Needs to Be Done

### 1. Lock provisioning scope to documented runtime boundaries
- [ ] Implement provisioning only through `POST /api/interviews/:id/provision` as documented in `docs/system/system-design/api-routes.md`.
- [ ] Keep provisioning as join-time runtime phase only (not queue-triggered flow and not persisted interview `status`) per `docs/system/system-design/state-management-lifecycle.md` and `docs/system/system-design/diagrams.md`.
- [ ] Keep implementation aligned with platform ownership in `docs/infrastructure/backend.md` (Cloudflare Workers + RealtimeKit + Hyperdrive/Postgres).

### 2. Define and export canonical provision contract
- [ ] Add/update shared request/response schemas and types for `POST /api/interviews/:id/provision` in `packages/shared/src/interviews.ts`.
- [ ] Export provision contract types from `packages/shared/src/index.ts`.
- [ ] Keep route fields aligned with `docs/system/system-design/api-routes.md`:
  - `mode`
  - `realtime.session_id`
  - `realtime.token`
  - `whiteboard.room_id`
  - `whiteboard.key`
- [ ] Keep persistence mapping aligned with `docs/system/system-design/db-schemas.md` interview columns:
  - `realtime_session_id`
  - `excalidraw_room_id`
  - `excalidraw_key`
- [ ] Keep snake_case field naming conventions consistent with existing interview route contracts.

### 3. Implement backend generation, persistence, and route wiring
- [ ] Implement/update interview backend module files in `packages/shared-backend/src/interviews/`:
  - `interview-repository.ts`
  - `interview-service.ts`
  - `interview-controller.ts`
  - `types.ts`
  - `index.ts`
- [ ] Register interview provisioning route wiring in `apps/backend-rest/src/index.ts`.
- [ ] Generate Realtime credentials and Excalidraw room credentials when interview row values are missing.
- [ ] Persist generated values to `interviews` row fields (`realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`) for stable reconnect behavior.
- [ ] Enforce idempotency: repeated provision calls for same active interview must reuse persisted values instead of regenerating them.
- [ ] Enforce participant-only authorization for provisioning and reject authenticated non-participants.

### 4. Enforce mode-specific behavior and lifecycle safety
- [ ] `peer_to_peer`: return same interview-scoped room/key pair for both participants.
- [ ] `ai_led`: return single-user interview-scoped room/key pair.
- [ ] Do not introduce or persist separate provisioning interview status; lifecycle status ownership remains in documented lifecycle flows (`scheduled`, `ongoing`, `completed`, `cancelled`).
- [ ] Keep matching/scheduling boundaries intact: provisioning does not change matcher ownership rules from `docs/system/system-design/matching-tiers.md`.

### 5. Add baseline backend coverage and security checks
- [ ] Keep this story's tests focused on baseline route/module correctness; expanded whiteboard resilience/observability coverage remains in Story 3.5.
- [ ] Add/update backend route/module tests for:
  - auth rejection
  - participant authorization
  - response contract shape
  - persistence of realtime/whiteboard fields
  - baseline idempotent retry behavior for repeated provision calls on same interview
- [ ] Ensure logs and telemetry do not leak sensitive provisioning secrets (Realtime tokens, `excalidraw_key`) while still capturing success/failure lifecycle points.

## Implementation Notes
- This story is backend/API focused. Frontend whiteboard embedding/sync UX stays in follow-up whiteboard stories in this milestone.
- Use Cloudflare **RealtimeKit** for realtime session credentials per `docs/infrastructure/backend.md`, not Cloudflare Calls.
- Do not move provisioning into queue consumers, matcher workers, or interview creation (`POST /api/interviews`) flows.

## End Goal
Participants can click Join and receive stable, correctly-scoped Realtime + Excalidraw credentials from `POST /api/interviews/:id/provision`, with idempotent persistence and no lifecycle drift from documented system design.
