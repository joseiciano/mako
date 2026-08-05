# Story 4.5: AI Chat Reliability, Security, and Observability

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Harden AI chat path with sensitive-data-safe telemetry, failure coverage, and cross-layer reliability checks.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-4-frontend-ai-led-session-chat-panel.md`

## What Needs to Be Done

### 1. Sensitive logging and telemetry guardrails
- [x] Ensure logs and telemetry for AI chat path do not leak sensitive values such as `excalidraw_key`, provider tokens, or equivalent secret material.
- [x] Keep AI chat observability aligned with existing backend/runtime logging patterns rather than introducing ad hoc debug output.

### 2. Failure-path reliability coverage
- [x] Add backend coverage for provider failure, malformed upstream response handling, and stable route error mapping.
- [x] Add frontend coverage proving AI chat failure states stay actionable and retry behavior remains bounded.

### 3. Cross-layer contract confidence
- [x] Add or update integration-style coverage where useful to prove frontend submit behavior, shared schemas, and backend route responses stay aligned.
- [x] Verify prompt-version and guidance-mode response fields remain stable across successful flows.

## Implementation Notes

### Observability and security hardened in this pass
- `packages/shared-backend/src/interviews/interview-service.ts`: `aiChat` now emits structured logs (`ai_chat_requested`, `ai_chat_succeeded`, `ai_chat_failed`) through the existing `InterviewServiceLogger`, aligned with lifecycle logging patterns. Context stays safe: only `interview_id`, `participant_user_id`, `guidance_mode`, `prompt_version`, and `error_type`. No message content, canvas snapshots, chat history, or whiteboard credentials (`realtime_session_id`, `excalidraw_key`, `excalidraw_room_id`, tokens) are ever logged.
- `packages/shared-backend/src/interviews/ai-gateway-responder.ts`: provider errors no longer echo raw upstream response bodies in the error message. `AiChatProviderError` now uses a stable message (`AI provider returned an error (<status>).`) so upstream content cannot leak to clients or logs.
- `apps/frontend/src/components/interviews/ai-chat/`: retry behavior is now bounded. The panel tracks `retryCount` (reset on each fresh submit) and stops offering retry after `MAX_AI_CHAT_RETRIES` (3), showing a "Retry limit reached" message while keeping the input actionable for a new message.

### Failure-path and cross-layer coverage
- Backend coverage (responder + service + controller) proves provider failure, malformed upstream response, empty reply, unavailable, and missing-credential paths, and asserts stable route error mapping (502/503) without leaking upstream detail.
- Frontend coverage proves failure states stay actionable and retry is bounded (limit reached hides retry, keeps input enabled).
- Shared backstop test (`packages/shared/src/ai-chat-reliability-observability-story.test.ts`) reconciles frontend submit (`use-interviews.ts`), shared schemas, backend route (`interview-controller.ts`), and docs so the `guidance_mode: "review"` literal and `prompt_version` fields stay aligned.

## Scope
- Scope is hardening existing AI chat flow, not introducing new user-facing AI features.
- Voice, transcripts, and post-interview reporting remain out of scope.

## End Goal
AI chat flow is hardened with safe telemetry, dependable failure behavior, and cross-layer coverage that reduces contract drift and sensitive-data leakage risk.
