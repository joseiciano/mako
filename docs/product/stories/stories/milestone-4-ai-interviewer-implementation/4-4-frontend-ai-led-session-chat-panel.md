# Story 4.4: Frontend AI-Led Session Chat Panel

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Add AI-led session chat UI that submits user turns and canvas snapshots to backend AI chat route with clear runtime states.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/frontend-pages.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-3-whiteboard-session-route-and-ui-shell.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md`

## What Needs to Be Done

### 1. AI-led-only session panel behavior
- [x] Add AI chat panel behavior in interview session route files under `apps/frontend/src/routes/` and `apps/frontend/src/components/` for `ai_led` interviews only.
- [x] Keep component structure aligned with existing smart/dumb frontend patterns used for session route work.

### 2. Chat submit integration
- [x] Submit user chat turns and current canvas snapshot to `POST /api/interviews/:id/ai-chat`.
- [x] Keep frontend payload shape aligned with shared AI chat schemas and documented snapshot expectations.

### 3. User-facing runtime states
- [x] Render loading, success, and failure states for AI chat turns.
- [x] Provide retry UX for failed AI chat submissions without requiring full session reload.

### 4. Frontend test coverage
- [x] Add or update frontend tests for AI-led chat submit flow, successful response rendering, and error/retry states.
- [x] Verify peer-to-peer session route behavior does not accidentally render or invoke AI chat-only UI.

## Implementation Notes
- This story owns frontend chat behavior only.
- Route contract changes must be resolved in shared/backend stories before frontend implementation.

## End Goal
AI-led interview sessions expose a frontend chat panel that safely sends user turns plus canvas context to backend AI route and presents reliable loading, success, and retry behavior.
