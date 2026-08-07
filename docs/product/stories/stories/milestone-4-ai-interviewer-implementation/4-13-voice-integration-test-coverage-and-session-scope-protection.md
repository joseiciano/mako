# Story 4.13: Voice Integration Test Coverage and Session Scope Protection

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Add cross-layer verification that AI-led voice behavior works, degrades safely, and stays out of non-AI session surfaces.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-3-whiteboard-session-route-and-ui-shell.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-5-ai-chat-reliability-security-and-observability.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-10-speech-to-text-ai-chat-input.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-11-text-to-speech-ai-reply-playback.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-12-voice-runtime-reliability-privacy-and-fallbacks.md`

## What Needs to Be Done

### 1. Add frontend voice behavior coverage
- [x] Add or update frontend tests covering microphone permission-denied behavior, successful speech capture to chat submit flow, playback controls, and failure fallback states.
- [x] Verify typed AI chat remains usable when browser voice capabilities are unavailable or disabled.

### 2. Prove backend and contract boundaries stay stable
- [x] Add or update backend or integration coverage where useful to prove voice-driven turns still resolve through stable AI chat contract boundaries.
- [x] Verify voice-driven runtime behavior does not mutate session lifecycle ownership or introduce hidden persisted state transitions.

### 3. Protect non-AI session surfaces
- [x] Verify non-AI session surfaces do not render or invoke voice-only AI interviewer behavior.
- [x] Verify peer-to-peer interview runtime remains unchanged when voice implementation ships for `ai_led` sessions.

## Implementation Notes
- Scope is verification of completed voice runtime stories, not new feature definition.
- Keep tests aligned with existing frontend, backend, and integration patterns already used for session and AI chat coverage.
- Backend/contract boundary stability is proven through frontend integration coverage: voice-driven turns resolve through the exact same `POST /api/interviews/:id/ai-chat` request contract used by typed turns, and no new backend route, request field, or persisted state is introduced. No backend changes were required.

## End Goal
Voice integration ships with confidence that AI-led voice flows work, failure states stay bounded, and non-AI interview experiences remain untouched.
