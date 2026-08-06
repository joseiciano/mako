# Story 4.12: Voice Runtime Reliability, Privacy, and Fallbacks

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Harden runtime voice behavior with duplicate-submit protection, sensitive-data-safe telemetry, and explicit degraded-mode fallbacks.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-6-real-time-communication.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-5-ai-chat-reliability-security-and-observability.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-10-speech-to-text-ai-chat-input.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-11-text-to-speech-ai-reply-playback.md`

## What Needs to Be Done

### 1. Prevent overlapping and duplicate runtime actions
- [x] Prevent duplicate in-flight voice submits caused by repeated taps or clicks, stale recognition callbacks, or overlapping send actions.
- [x] Prevent playback or recognition state transitions from creating ambiguous UI state when voice input and AI reply playback happen close together.

### 2. Protect sensitive data in logs and telemetry
- [x] Ensure logs and telemetry do not leak microphone payloads, raw room credentials, provider secrets, or equivalent sensitive material.
- [x] Keep voice observability aligned with existing AI chat and session logging patterns rather than introducing ad hoc debug output.

### 3. Define explicit degraded-mode behavior
- [x] Define fallback behavior when speech recognition or speech synthesis is unavailable, denied, interrupted, or fails mid-session.
- [x] Ensure typed AI chat remains usable and clearly presented as fallback path when voice runtime behavior cannot proceed.

## Implementation Notes
- Scope is hardening voice runtime behavior, not adding new primary chat features.
- Prefer ephemeral runtime handling over persisted failure or transcript state.
- Keep lifecycle ownership unchanged while adding guardrails.

## End Goal
Voice runtime behavior fails safely, avoids duplicate actions, protects sensitive data, and degrades cleanly back to typed AI chat when browser or runtime conditions break voice features.
