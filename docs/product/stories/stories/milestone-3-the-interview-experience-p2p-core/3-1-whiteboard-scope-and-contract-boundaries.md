# Story 3.1: Whiteboard Scope and Contract Boundaries

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Lock collaborative whiteboard scope and reconcile API/schema boundaries before implementation.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/milestones.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/db-schemas.md`
- `docs/system/system-design/diagrams.md`
- `docs/system/system-design/state-management-lifecycle.md`

## What Needs to Be Done

### 1. Whiteboard behavior scope lock
- [x] Lock whiteboard behavior and contracts to these source documents:
  - `docs/product/stories/milestones.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/db-schemas.md`
  - `docs/system/system-design/api-routes.md`
- [x] Keep whiteboard provisioning as join-time route behavior (`POST /api/interviews/:id/provision`), not queue-triggered behavior.

### 2. Reconcile provisioning contract for Excalidraw session data
- [x] Define the canonical response contract for whiteboard provisioning (mode + Realtime token/session + Excalidraw room credentials) and update docs where needed.
- [x] Ensure naming is consistent with `interviews` columns in `docs/system/system-design/db-schemas.md` (`realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`).
- [x] Define mode-specific expectations: `peer_to_peer` returns shared interview room credentials for both participants; `ai_led` returns single-user room credentials.

### 3. Explicit scope boundaries with adjacent milestone stories
- [x] Keep whiteboard story scope limited to embedding/syncing Excalidraw for live sessions.
- [x] Document that AI guidance should consume Excalidraw scene JSON (or normalized derivative) as source-of-truth input; Mermaid is optional derived output (reporting/export), not required request input.
- [x] Document Excalidraw MCP boundary: MCP may access a session only when explicitly joined with room credentials, not by implicit/global access.
- [x] Mark post-interview artifact processing (for example `screenshot_urls` analysis/reporting) as follow-up scope for Milestone 5 stories.
- [x] Keep lifecycle timer/start/end orchestration ownership in session lifecycle stories (`3-8`, `3-10`, `3-11`, `3-12`), not this ticket.

## Implementation Notes
- Completed as documentation-contract reconciliation only; no application route, schema migration, or UI implementation belongs to this scope.
- Canonical provision response is documented in `docs/system/system-design/api-routes.md` and maps credential names to `docs/system/system-design/db-schemas.md`.
- Follow-up implementation remains in subsequent Milestone 3 and Milestone 5 stories.

## End Goal
Collaborative whiteboard scope and contracts are unambiguous, with no drift between route docs, schema docs, and lifecycle boundaries before coding begins.
