# Story 4.3: AI Gateway Prompt and Canvas Guidance Integration

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Connect guarded AI chat requests to Cloudflare AI Gateway with prompt versioning and canvas-aware guidance inputs.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-2-ai-chat-route-guardrails-and-runtime-behavior.md`

## What Needs to Be Done

### 1. AI request assembly
- [x] Send user message, relevant chat history, and current Excalidraw snapshot payload through Cloudflare AI Gateway for AI-led chat turns.
- [x] Keep canvas guidance input aligned to Excalidraw JSON or documented server-side normalized derivative, not Mermaid as required upstream input.

### 2. Prompt versioning and auditability
- [x] Introduce explicit prompt versioning for AI chat guidance behavior.
- [x] Return `prompt_version` in AI chat responses as documented in `docs/system/system-design/api-routes.md`.

### 3. Snapshot cadence rules
- [x] Document and implement snapshot cadence expectations around explicit review actions and/or debounced snapshots.
- [x] Avoid per-stroke snapshot submission behavior for AI chat requests.

### 4. AI integration tests
- [x] Add backend tests covering successful AI response mapping, provider failure handling, and prompt-version response behavior.
- [x] Verify AI integration remains behind existing route guardrails from Story 4.2.

### 5. Cache bypass
- [x] AI Gateway requests bypass cache due to mutable canvas context.

## Implementation Notes
- Scope is runtime AI guidance only.
- Voice input/output, transcript generation, and post-interview feedback analysis remain out of scope.
- Prompt version constant: `AI_CHAT_PROMPT_VERSION` is defined in `packages/shared-backend/src/interviews/ai-chat-prompt.ts` (value `system-design-review-v1` as of Story 4.6) and re-exported by `packages/shared-backend/src/interviews/ai-gateway-responder.ts`. In Story 4.3 it was originally `ai-whiteboard-v1` in `ai-gateway-responder.ts`.
- Canvas snapshot input is enforced as `excalidraw_scene` literal type in the shared schema (`packages/shared/src/interviews.ts`).
- Snapshot cadence is documented in `docs/system/system-design/api-routes.md`: clients send snapshots on explicit review actions and/or debounced intervals, not per-stroke.
- AI Gateway responder uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` bindings; optional `gatewayId` is sent via the `cf-aig-gateway-id` header on the Cloudflare REST `/accounts/{id}/ai/v1/chat/completions` endpoint, with a direct Workers AI call (no header) when not configured. See `docs/infrastructure/backend.md`.
- Provider errors (non-OK upstream response, malformed JSON, empty reply) return 502; missing credentials or network/timeout failures return 503.

## End Goal
Guarded AI chat requests are translated into Cloudflare AI Gateway calls with canvas-aware context, explicit prompt versioning, and test-covered response/failure behavior.
