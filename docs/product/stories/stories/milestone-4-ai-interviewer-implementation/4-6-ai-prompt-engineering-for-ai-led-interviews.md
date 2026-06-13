# Story 4.6: AI Prompt Engineering for AI-Led Interviews

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Define and implement prompt inputs, prompt structure, and initial system-design interviewer prompt behavior for AI-led interview sessions.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/diagrams.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md`

## What Needs to Be Done

### 1. Define prompt input boundaries
- [ ] Define prompt-builder inputs for AI-led chat turns using documented request context from `POST /api/interviews/:id/ai-chat`.
- [ ] Include user message, relevant chat history, interview type, guidance mode, and Excalidraw snapshot context in prompt input design.
- [ ] Keep canvas context aligned with Excalidraw JSON or documented normalized derivative, not Mermaid as required input.

### 2. Define initial prompt behavior for system design interviews
- [ ] Author initial system prompt for `system_design` AI-led interviews.
- [ ] Ensure prompt behavior matches Milestone 4 goal of interviewer-style guidance rather than post-interview scoring or report generation.
- [ ] Define expected guidance style for review-oriented turns such as clarifying questions, gap detection, tradeoff probing, and next-step hints.

### 3. Define prompt versioning and storage conventions
- [ ] Define prompt version naming convention compatible with `prompt_version` response field documented in `docs/system/system-design/api-routes.md`.
- [ ] Store prompt definitions in explicit backend-owned files or modules so prompt revisions are auditable in code review.
- [ ] Keep prompt version ownership aligned with AI Gateway integration behavior rather than frontend-only state.

### 4. Define prompt safety and behavioral constraints
- [ ] Add prompt rules that prevent AI guidance from inventing unseen canvas state or assuming missing interview context as fact.
- [ ] Constrain AI behavior to runtime interview guidance and keep it from taking ownership of lifecycle, timer, or session control behavior.
- [ ] Define refusal or fallback behavior for unsupported, low-context, or malformed guidance requests where useful.

### 5. Add prompt evaluation coverage
- [ ] Add prompt fixtures, examples, or tests that validate prompt assembly for representative `system_design` AI chat requests.
- [ ] Verify prompt output expectations remain compatible with AI chat response contract fields such as `reply`, `guidance_mode`, and `prompt_version`.
- [ ] Document forward-compatible handling for `coding` and `behavioral` interview types without requiring full prompt rollout for them in this story.

## Implementation Notes
- Scope for this story is prompt design and prompt-definition implementation, not frontend chat UX.
- Current implementation focus should remain `system_design`, consistent with existing product/story scope, while preserving forward-compatible structure for other documented interview types.
- AI provider transport, request execution, and provider failure mapping remain owned by `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md`.
- Voice input/output, transcript generation, and post-interview feedback analysis remain out of scope.

## End Goal
AI-led interview sessions have explicit, versioned, code-reviewed prompt definitions for system-design guidance, with clear input boundaries, safe behavioral constraints, and evaluation coverage that supports reliable runtime AI chat behavior.
