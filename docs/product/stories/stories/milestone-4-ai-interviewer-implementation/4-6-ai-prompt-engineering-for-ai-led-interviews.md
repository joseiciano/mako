# Story 4.6: AI Prompt Engineering for AI-Led Interviews

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Define and implement prompt inputs, prompt structure, and initial system-design interviewer prompt behavior for AI-led interview sessions.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/diagrams.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md`

## What Needs to Be Done

### 1. Define prompt input boundaries
- [x] Define prompt-builder inputs for AI-led chat turns using documented request context from `POST /api/interviews/:id/ai-chat`.
- [x] Include user message, relevant chat history, interview type, guidance mode, and Excalidraw snapshot context in prompt input design.
- [x] Keep canvas context aligned with Excalidraw JSON or documented normalized derivative, not Mermaid as required input.

### 2. Define initial prompt behavior for system design interviews
- [x] Author initial system prompt for `system_design` AI-led interviews.
- [x] Ensure prompt behavior matches Milestone 4 goal of interviewer-style guidance rather than post-interview scoring or report generation.
- [x] Define expected guidance style for review-oriented turns such as clarifying questions, gap detection, tradeoff probing, and next-step hints.

### 3. Define prompt versioning and storage conventions
- [x] Define prompt version naming convention compatible with `prompt_version` response field documented in `docs/system/system-design/api-routes.md`.
- [x] Store prompt definitions in explicit backend-owned files or modules so prompt revisions are auditable in code review.
- [x] Keep prompt version ownership aligned with AI Gateway integration behavior rather than frontend-only state.

### 4. Define prompt safety and behavioral constraints
- [x] Add prompt rules that prevent AI guidance from inventing unseen canvas state or assuming missing interview context as fact.
- [x] Constrain AI behavior to runtime interview guidance and keep it from taking ownership of lifecycle, timer, or session control behavior.
- [x] Define refusal or fallback behavior for unsupported, low-context, or malformed guidance requests where useful.

### 5. Add prompt evaluation coverage
- [x] Add prompt fixtures, examples, or tests that validate prompt assembly for representative `system_design` AI chat requests.
- [x] Verify prompt output expectations remain compatible with AI chat response contract fields such as `reply`, `guidance_mode`, and `prompt_version`.
- [x] Document forward-compatible handling for `coding` and `behavioral` interview types without requiring full prompt rollout for them in this story.

## Implementation Notes
- Prompt definitions, the `AI_CHAT_PROMPT_VERSION` constant (`system-design-review-v1`), and pure message/prompt builders are owned by the new backend module `packages/shared-backend/src/interviews/ai-chat-prompt.ts`. It exports `buildAiChatMessages` (system -> history -> current message assembly), `buildSystemPrompt`, `buildSystemDesignSystemPrompt`, and `buildUnsupportedTypeSystemPrompt`.
- `AiChatServiceInput` in `packages/shared-backend/src/interviews/types.ts` now carries `interview_type`; `InterviewService.aiChat` derives it from the retrieved interview and passes it into the repository port at the existing `generateReply` call site. The route request shape is unchanged.
- `packages/shared-backend/src/interviews/ai-gateway-responder.ts` now uses the prompt module for message assembly and re-exports `AI_CHAT_PROMPT_VERSION` so the previous export contract stays valid. Provider transport/error handling is unchanged.
- Scope for this story is prompt design and prompt-definition implementation, not frontend chat UX.
- Current implementation focus remains `system_design`, consistent with existing product/story scope, while preserving forward-compatible structure for other documented interview types: `coding` and `behavioral` receive a safe unsupported-type fallback prompt stating specialized guidance is not available yet and not pretending a system-design prompt applies.
- AI provider transport, request execution, and provider failure mapping remain owned by `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md`.
- Voice input/output, transcript generation, and post-interview feedback analysis remain out of scope.

## End Goal
AI-led interview sessions have explicit, versioned, code-reviewed prompt definitions for system-design guidance, with clear input boundaries, safe behavioral constraints, and evaluation coverage that supports reliable runtime AI chat behavior.
