# Story 3.11: Session Lifecycle Frontend Controls and Timer

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Add session lifecycle controls and workflow-backed timer UX to `/interviews/:id/session` without collapsing frontend state boundaries.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-3-whiteboard-session-route-and-ui-shell.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-10-session-workflow-timer-orchestration.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/infrastructure/frontend.md`

## What Needs to Be Done

### 1. Extend session route dependencies and smart/dumb boundaries
- [ ] Update `docs/system/system-design/frontend-pages.md` so `/interviews/:id/session` explicitly lists lifecycle control and timer dependencies in addition to join provisioning dependencies.
- [ ] Extend route implementation in `apps/frontend/src/routes/` with lifecycle control data/mutations and timer state consumption.
- [ ] Keep component structure aligned with frontend smart/dumb patterns:
  - smart layer owns query/mutation orchestration
  - dumb layer renders lifecycle and timer states

### 2. Implement deterministic lifecycle control UX
- [ ] Add `Start Session` and `End Session` controls to `/interviews/:id/session`.
- [ ] Use TanStack Query for server-backed lifecycle/timer state and TanStack Store for local UI state only.
- [ ] Implement deterministic UI gating:
  - show `Start Session` only when participant is joined and interview is `scheduled`
  - show timer and `End Session` only when interview is `ongoing`
  - show terminal completed/cancelled UX states with no further lifecycle actions

### 3. Implement timer rendering and retry behavior
- [ ] Render workflow-backed timer state with refresh/reconnect continuity.
- [ ] Show warning and terminal session states with explicit user-facing copy.
- [ ] Handle lifecycle failures/retries with explicit feedback, including duplicate-click and in-flight protection.

### 4. Add frontend coverage
- [ ] Add/update route/component tests for:
  - lifecycle control visibility by status
  - timer rendering and continuity on refresh/reconnect
  - warning and terminal state UX
  - retry/error behavior for start/end actions

## Implementation Notes
- Backend lifecycle transitions stay in Story 3.8.
- Workflow timer orchestration stays in Story 3.10.
- Concurrency hardening and lifecycle observability stay in Story 3.12.

## End Goal
Participants can start and end sessions from `/interviews/:id/session`, see accurate workflow-backed timer state, and receive clear lifecycle feedback across refreshes and retries.
