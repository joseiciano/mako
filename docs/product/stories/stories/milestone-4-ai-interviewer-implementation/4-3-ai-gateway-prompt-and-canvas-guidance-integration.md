# Story 4.3: AI Gateway Prompt and Canvas Guidance Integration

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Connect guarded AI chat requests to Cloudflare AI Gateway with prompt versioning and canvas-aware guidance inputs.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-2-ai-chat-route-guardrails-and-runtime-behavior.md`

## What Needs to Be Done

### 1. AI request assembly
- [ ] Send user message, relevant chat history, and current Excalidraw snapshot payload through Cloudflare AI Gateway for AI-led chat turns.
- [ ] Keep canvas guidance input aligned to Excalidraw JSON or documented server-side normalized derivative, not Mermaid as required upstream input.

### 2. Prompt versioning and auditability
- [ ] Introduce explicit prompt versioning for AI chat guidance behavior.
- [ ] Return `prompt_version` in AI chat responses as documented in `docs/system/system-design/api-routes.md`.

### 3. Snapshot cadence rules
- [ ] Document and implement snapshot cadence expectations around explicit review actions and/or debounced snapshots.
- [ ] Avoid per-stroke snapshot submission behavior for AI chat requests.

### 4. AI integration tests
- [ ] Add backend tests covering successful AI response mapping, provider failure handling, and prompt-version response behavior.
- [ ] Verify AI integration remains behind existing route guardrails from Story 4.2.

## Implementation Notes
- Scope is runtime AI guidance only.
- Voice input/output, transcript generation, and post-interview feedback analysis remain out of scope.

## End Goal
Guarded AI chat requests are translated into Cloudflare AI Gateway calls with canvas-aware context, explicit prompt versioning, and test-covered response/failure behavior.
