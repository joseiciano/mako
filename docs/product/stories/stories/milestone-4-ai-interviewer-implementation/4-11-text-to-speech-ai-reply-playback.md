# Story 4.11: Text-to-Speech AI Reply Playback

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Add audible playback for AI guidance replies in AI-led sessions while keeping existing text response from AI chat as canonical reply content and session controls intact.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/frontend-pages.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-6-real-time-communication.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-4-frontend-ai-led-session-chat-panel.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-9-voice-contract-and-runtime-boundaries.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-10-speech-to-text-ai-chat-input.md`

## What Needs to Be Done

### 1. Add AI reply playback behavior
- [x] Add text-to-speech playback for successful AI guidance replies so `ai_led` sessions can respond audibly as well as visually without introducing separate backend voice response generation.
- [x] Keep spoken playback anchored to same AI chat response content already rendered in chat UI rather than generating separate reply text or alternate response payloads.

### 2. Provide bounded playback controls
- [x] Provide user controls for replay, stop, and mute or disable voice playback without removing text visibility for same AI response.
- [x] Keep controls scoped to AI-led session runtime UI and avoid changing existing peer media control ownership.

### 3. Preserve compatibility with session media realities
- [x] Keep playback behavior compatible with existing session media controls and browser permission realities documented in `3-6-real-time-communication.md`.
- [x] Ensure playback does not block typed follow-up turns or ordinary AI chat rendering.

## Implementation Notes
- Scope here is text-to-speech playback only.
- Do not expand this story into speech recognition fallback logic beyond what playback itself needs.
- Do not add transcript export or post-interview audio features.

## End Goal
AI-led sessions can audibly play AI chat replies with bounded playback controls while preserving existing text chat visibility and session control expectations.
