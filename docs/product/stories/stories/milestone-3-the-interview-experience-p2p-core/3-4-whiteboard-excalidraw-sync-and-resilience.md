# Story 3.4: Whiteboard Excalidraw Sync and Resilience

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Integrate Excalidraw collaboration and resilient reconnect behavior for live peer sessions.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-3-whiteboard-session-route-and-ui-shell.md`
- `docs/system/system-design/diagrams.md`

## What Needs to Be Done

### 1. Excalidraw embed integration in session UI
- [ ] Add whiteboard component(s) in `apps/frontend/src/components/interviews/whiteboard/` for Excalidraw rendering.
- [ ] Feed room credentials from join-time provision response into Excalidraw collaboration configuration.
- [ ] Keep whiteboard initialization gated to successful provisioning state.

### 2. Collaboration synchronization behavior
- [ ] Ensure both participants join the same room/key pair and see synchronized canvas updates.
- [ ] Validate that whiteboard sync lifecycle follows join-time provisioning boundaries (no pre-provision background join).
- [ ] Keep sync transport assumptions aligned with `docs/system/system-design/diagrams.md` (Cloudflare Realtime-backed session architecture).

### 3. Reconnect and recovery handling
- [ ] Implement reconnect-safe UI behavior for temporary network drops (show reconnecting state and recover session when possible).
- [ ] Avoid accidental room/key regeneration for retry flows within the same active interview.
- [ ] Define fallback flow for unrecoverable sync failures (for example: retry join action with clear messaging).

### 4. Whiteboard integration tests
- [ ] Add frontend tests for initial mount, collaboration config hand-off, reconnect state rendering, and failure fallback behavior.

## End Goal
The whiteboard is embedded with stable collaborative sync and resilient recovery behavior, enabling practical live system-design collaboration during interviews.
