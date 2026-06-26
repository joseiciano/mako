# Story: Real-time Communication

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement reliable peer-to-peer audio/video communication in the interview session experience using Cloudflare RealtimeKit.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-2-whiteboard-provision-contract-and-backend-wiring.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/diagrams.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`

## What Needs to Be Done

### 1. Frontend session media integration
- [x] Implement session media UI/component wiring in frontend session route files under `apps/frontend/src/routes/` and `apps/frontend/src/components/` (using existing smart/dumb component patterns).
- [x] Connect clients to Cloudflare Realtime using **RealtimeKit** credentials returned from `POST /api/interviews/:id/provision`.
- [x] Start media connection only after explicit user join action and successful provisioning response.
- [x] Render explicit session media states: pre-join, connecting, connected, waiting-for-peer, reconnecting, and failed.

### 2. Media controls and participant UX behavior
- [x] Add participant controls for microphone and camera enable/disable with clear local state feedback.
- [x] Handle browser/device permission-denied and device-unavailable scenarios with actionable retry guidance.
- [x] Show remote participant presence/availability state so users understand whether the other participant is connected.
- [x] Keep user-facing copy and interaction behavior aligned with `docs/system/system-design/frontend-pages.md` interview session expectations.

### 3. Resilience and safety guardrails
- [x] Prevent duplicate in-flight connect attempts from repeated join clicks/interactions.
- [x] Reconnect logic must reuse interview-scoped provisioned credentials for active sessions (idempotent retry behavior), not regenerate new session identity in the client.
- [x] Ensure sensitive values (Realtime tokens, `excalidraw_key`) are never logged or exposed in client telemetry.
- [x] Keep transport choice aligned with infrastructure docs: Cloudflare RealtimeKit only (`docs/infrastructure/backend.md`), never Cloudflare Calls.

### 4. Testing coverage
- [x] Add/update frontend tests for join gating, connection state transitions, media control toggles, permission failures, and reconnect/failure states.
- [x] Add/update integration tests (where applicable) that prove client behavior remains compatible with the provision route contract from `docs/system/system-design/api-routes.md`.

## Implementation Notes
- Scope is limited to **in-session peer-to-peer audio/video communication** for `/interviews/:id/session`.
- Interview creation/matching are pre-existing inputs (no `POST /api/interviews` create behavior or matcher ownership changes in this story), consistent with `docs/system/system-design/matching-tiers.md`.
- Join-time credential provisioning ownership remains `POST /api/interviews/:id/provision` and must not be moved into queues/workers.
- This story must not introduce a new persisted provisioning/media lifecycle status; status ownership remains in lifecycle/session stories.
- `POST /api/interviews/:id/ai-chat` stays out of scope (Milestone 4 ownership).
- If implementation changes expected route fields or behavior, reconcile updates in:
  - `docs/system/system-design/api-routes.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/frontend-pages.md`
- This story is focused on **P2P** live communication behavior for Milestone 3.
- Whiteboard-specific rendering/sync work is handled in dedicated whiteboard stories under the same milestone.
- Session timer warnings, start/end orchestration, and terminal state transitions remain owned by session lifecycle stories (`3-8`, `3-10`, `3-11`, `3-12`) and Cloudflare Workflow boundaries.
- Recording, screenshot persistence, and post-interview feedback generation are out of scope for this story.

## End Goal
Two matched participants can join the interview session and communicate over stable real-time audio/video with clear connection states, safe retry behavior, and no drift from documented lifecycle, provisioning, or infrastructure boundaries.
