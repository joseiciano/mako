# Story 3.1: Whiteboard Scope and Contract Boundaries

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Lock collaborative whiteboard scope and reconcile API/schema boundaries before implementation.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/room-provisioning.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/real-time-communication.md`

## What Needs to Be Done

### 1. Whiteboard behavior scope lock
- [ ] Lock whiteboard behavior and contracts to these source documents:
  - `docs/product/stories/milestones.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/db-schemas.md`
  - `docs/system/system-design/api-routes.md`
- [ ] Keep whiteboard provisioning as join-time route behavior (`POST /api/interviews/:id/provision`), not queue-triggered behavior.

### 2. Reconcile provisioning contract for Excalidraw session data
- [ ] Define the canonical response contract for whiteboard provisioning (mode + Realtime token/session + Excalidraw room credentials) and update docs where needed.
- [ ] Ensure naming is consistent with `interviews` columns in `docs/system/system-design/db-schemas.md` (`realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`).
- [ ] Define mode-specific expectations: `peer_to_peer` returns shared interview room credentials for both participants; `ai_led` returns single-user room credentials.

### 3. Explicit scope boundaries with adjacent milestone stories
- [ ] Keep whiteboard story scope limited to embedding/syncing Excalidraw for live sessions.
- [ ] Document that AI guidance should consume Excalidraw scene JSON (or normalized derivative) as source-of-truth input; Mermaid is optional derived output (reporting/export), not required request input.
- [ ] Document Excalidraw MCP boundary: MCP may access a session only when explicitly joined with room credentials, not by implicit/global access.
- [ ] Mark post-interview artifact processing (for example `screenshot_urls` analysis/reporting) as follow-up scope for Milestone 5 stories.
- [ ] Keep lifecycle timer/start/end orchestration ownership in `session-lifecycle.md` scope, not this ticket.

## End Goal
Collaborative whiteboard scope and contracts are unambiguous, with no drift between route docs, schema docs, and lifecycle boundaries before coding begins.
