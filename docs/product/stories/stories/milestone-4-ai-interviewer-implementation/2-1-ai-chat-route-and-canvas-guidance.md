# Story 2.1: AI Chat Route and Canvas Guidance

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Implement the AI-led chat route and runtime canvas-aware guidance flow for interview sessions.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/diagrams.md`

## What Needs to Be Done

### 1. Shared API contract for AI chat guidance
- [ ] Add/update shared request/response schemas and types for `POST /api/interviews/:id/ai-chat` in `packages/shared/src/interviews.ts`.
- [ ] Export AI chat contract types from `packages/shared/src/index.ts`.
- [ ] Keep request contract aligned to Excalidraw snapshot input expectations (scene JSON or normalized derivative), not Mermaid as required input.

### 2. Backend route wiring and guardrails
- [ ] Add AI chat route wiring in backend interview module/controller and register route in `apps/backend-rest/src/index.ts`.
- [ ] Enforce participant-only authorization and reject non-participant requests.
- [ ] Enforce interview mode guard (`mode = 'ai_led'`) and reject peer-to-peer interviews for this endpoint.
- [ ] Ensure route behavior is runtime-only guidance and does not mutate interview lifecycle `status` ownership.

### 3. AI prompt + canvas guidance integration
- [ ] Send chat history, user message, and current canvas snapshot payload to AI provider through Cloudflare AI Gateway.
- [ ] Version prompts for auditability (for example include `prompt_version` in responses).
- [ ] Add snapshot cadence rules in implementation docs/tests (explicit review action and/or debounced snapshots, not per-stroke).

### 4. Frontend session chat integration (AI-led only)
- [ ] Add AI chat panel behavior in the interview session route for AI-led mode.
- [ ] Submit user chat turns and current canvas snapshot to `POST /api/interviews/:id/ai-chat`.
- [ ] Render loading, success, and failure states with retry UX.

### 5. Reliability, security, and observability coverage
- [ ] Add backend tests for authorization, mode guard behavior, request/response validation, and failure handling.
- [ ] Add frontend tests for AI-led chat submit flow and error/retry states.
- [ ] Ensure logs/telemetry avoid leaking sensitive values (for example `excalidraw_key`, raw tokens).

## End Goal
AI-led interview sessions support a production-ready chat guidance loop that is grounded in canvas state, strongly guarded by auth/mode checks, and covered by meaningful tests.
