# Story 4.9: Voice Contract and Runtime Boundaries

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Define how runtime voice behavior fits AI-led interview session ownership without drifting from existing AI chat, provision, start, or end boundaries.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/diagrams.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-3-whiteboard-session-route-and-ui-shell.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-6-real-time-communication.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-2-ai-chat-route-guardrails-and-runtime-behavior.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-4-frontend-ai-led-session-chat-panel.md`

## What Needs to Be Done

### 1. Lock voice ownership to existing AI chat route
- [x] Keep runtime speech-to-text input and text-to-speech playback inside documented `POST /api/interviews/:id/ai-chat` ownership rather than introducing a separate backend voice route for this milestone.
- [x] Treat voice as runtime wrapper behavior around existing AI chat turns: speech recognition produces same chat `message` contract used by typed input, and playback uses same `reply` content returned from AI chat responses.

### 2. Preserve lifecycle and session boundaries
- [x] Keep voice scope limited to `mode = 'ai_led'` runtime behavior inside `/interviews/:id/session`.
- [x] Ensure voice activity does not create new interview statuses or bypass `POST /api/interviews/:id/provision`, `POST /api/interviews/:id/start`, or `POST /api/interviews/:id/end` ownership.

### 3. Reconcile design docs to locked wrapper model
- [x] Update `docs/system/system-design/api-routes.md`, `docs/system/system-design/frontend-pages.md`, and `docs/system/system-design/diagrams.md` only as needed to reflect wrapper-model voice behavior under existing AI chat and session expectations.
- [x] Keep documentation aligned with existing AI chat and session lifecycle terminology and explicitly avoid parallel voice-specific lifecycle or route concepts for current scope.

## Implementation Notes
- Scope here is contract and documentation alignment to locked wrapper-model voice ownership only.
- Do not implement microphone capture, transcription, playback, or fallback UI in this story.
- Prefer ephemeral runtime behavior; do not add persisted interview schema fields or new backend voice route contracts unless future scope first reconciles those changes in source-of-truth system docs.

## End Goal
Runtime voice behavior has clear documented wrapper-model ownership inside existing AI-led session and AI chat boundaries, allowing later implementation work without route or lifecycle drift.
