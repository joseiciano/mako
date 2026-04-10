# Story: Room Provisioning

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement join-time provisioning for Cloudflare Realtime credentials and Excalidraw collaboration room data used by interview sessions.
**Status**: Todo

## What Needs to Be Done

### 1. Lock provisioning scope to documented runtime boundaries
- [ ] Implement provisioning only through `POST /api/interviews/:id/provision` as documented in `docs/system/system-design/api-routes.md`.
- [ ] Keep provisioning as a **join-time runtime phase** (not a queue-triggered flow and not a persisted interview `status`) per `docs/system/system-design/state-management-lifecycle.md` and `docs/system/system-design/diagrams.md`.
- [ ] Keep implementation aligned with platform infra ownership in `docs/infrastructure/backend.md` (Cloudflare Workers + RealtimeKit + Hyperdrive/Postgres).

### 2. Define and enforce canonical provision response contract
- [ ] Return contract fields aligned with `docs/system/system-design/api-routes.md`:
  - `mode`
  - `realtime.session_id`
  - `realtime.token`
  - `whiteboard.room_id`
  - `whiteboard.key`
- [ ] Keep naming and persistence mapping consistent with `docs/system/system-design/db-schemas.md` interview columns:
  - `realtime_session_id`
  - `excalidraw_room_id`
  - `excalidraw_key`
- [ ] Keep snake_case conventions consistent with existing interview route contracts.

### 3. Implement backend generation and persistence behavior
- [ ] In the backend interview provisioning flow, generate Realtime credentials and Excalidraw room credentials when interview row values are missing.
- [ ] Persist generated provisioning values to the `interviews` row (`realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`) for stable reconnect behavior.
- [ ] Enforce idempotency: repeated provision calls for the same active interview must reuse persisted values instead of regenerating them.
- [ ] Enforce participant-only authorization for provisioning; reject authenticated non-participants.

### 4. Enforce mode-specific behavior and lifecycle safety
- [ ] `peer_to_peer`: return the same interview-scoped room/key pair for both participants.
- [ ] `ai_led`: return a single-user interview-scoped room/key pair.
- [ ] Do not introduce or persist a separate "provisioning" interview status; lifecycle status ownership remains in documented lifecycle flows (`scheduled`, `ongoing`, `completed`, `cancelled`).
- [ ] Keep matching/scheduling boundaries intact: provisioning does not change matcher ownership rules from `docs/system/system-design/matching-tiers.md`.

### 5. Add baseline reliability and security checks
- [ ] Add backend route/module tests for auth rejection, participant authorization, response contract shape, and persistence writes.
- [ ] Add tests for idempotent retry/reconnect calls against the same interview.
- [ ] Ensure logs and telemetry do not leak sensitive provisioning secrets (Realtime tokens, `excalidraw_key`) while still capturing success/failure lifecycle points.

## Implementation Notes
- This story is backend/API focused; frontend whiteboard embedding/sync UX is handled by dedicated follow-up stories in this milestone.
- Use Cloudflare **RealtimeKit** for realtime session credentials (per `docs/infrastructure/backend.md`), not Cloudflare Calls.
- Do not move provisioning into queue consumers, matcher workers, or interview creation (`POST /api/interviews`) flows.

## End Goal
Participants can click Join and receive stable, correctly-scoped Realtime + Excalidraw credentials from `POST /api/interviews/:id/provision`, with idempotent persistence and no lifecycle drift from the documented system design.
