# Story 4.5: AI Chat Reliability, Security, and Observability

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Harden AI chat path with sensitive-data-safe telemetry, failure coverage, and cross-layer reliability checks.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-4-frontend-ai-led-session-chat-panel.md`

## What Needs to Be Done

### 1. Sensitive logging and telemetry guardrails
- [ ] Ensure logs and telemetry for AI chat path do not leak sensitive values such as `excalidraw_key`, provider tokens, or equivalent secret material.
- [ ] Keep AI chat observability aligned with existing backend/runtime logging patterns rather than introducing ad hoc debug output.

### 2. Failure-path reliability coverage
- [ ] Add backend coverage for provider failure, malformed upstream response handling, and stable route error mapping.
- [ ] Add frontend coverage proving AI chat failure states stay actionable and retry behavior remains bounded.

### 3. Cross-layer contract confidence
- [ ] Add or update integration-style coverage where useful to prove frontend submit behavior, shared schemas, and backend route responses stay aligned.
- [ ] Verify prompt-version and guidance-mode response fields remain stable across successful flows.

## Implementation Notes
- Scope is hardening existing AI chat flow, not introducing new user-facing AI features.
- Voice, transcripts, and post-interview reporting remain out of scope.

## End Goal
AI chat flow is hardened with safe telemetry, dependable failure behavior, and cross-layer coverage that reduces contract drift and sensitive-data leakage risk.
