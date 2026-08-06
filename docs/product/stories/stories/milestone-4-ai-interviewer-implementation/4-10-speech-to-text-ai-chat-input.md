# Story 4.10: Speech-to-Text AI Chat Input

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Add microphone-driven speech capture for AI-led sessions and submit resulting text through exact existing AI chat request path used by typed turns.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/frontend-pages.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-3-whiteboard-session-route-and-ui-shell.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-6-real-time-communication.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-4-frontend-ai-led-session-chat-panel.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-9-voice-contract-and-runtime-boundaries.md`

## What Needs to Be Done

### 1. Add AI-led-only microphone capture entry points
- [x] Add microphone-driven user-turn capture in frontend session route and component files under `apps/frontend/src/routes/` and `apps/frontend/src/components/` for `ai_led` interviews only.
- [x] Keep component structure aligned with existing session smart/dumb frontend patterns rather than embedding browser voice logic across unrelated session surfaces.

### 2. Submit recognized speech through exact existing AI chat path
- [x] Convert captured speech into text that is submitted through exact existing AI chat request path instead of introducing separate backend voice guidance flow logic.
- [x] Keep final backend request context aligned with same shared chat payload contract and submit behavior used for typed user turns.

### 3. Render clear voice-input runtime states
- [x] Render idle, listening, transcribing, ready-to-send, and failed voice-input states so users can tell whether spoken input became an AI chat turn.
- [x] Keep typed chat path usable while voice input UI is present.

## Implementation Notes
- Scope here is frontend speech-to-text input only.
- Do not add text-to-speech playback controls in this story.
- Do not broaden voice behavior into `peer_to_peer` session surfaces.

## End Goal
AI-led session UI can capture spoken user input, convert it into chat text, and submit it through exact existing AI chat flow with understandable runtime states.
