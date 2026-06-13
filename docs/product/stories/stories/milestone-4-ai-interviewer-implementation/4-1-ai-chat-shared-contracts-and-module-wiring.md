# Story 4.1: AI Chat Shared Contracts and Module Wiring

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Define shared AI chat contracts and backend module wiring for `POST /api/interviews/:id/ai-chat` so later Milestone 4 tickets can build on stable route boundaries.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`

## What Needs to Be Done

### 1. Shared AI chat schemas and exports
- [ ] Add or update shared request/response schemas and types for `POST /api/interviews/:id/ai-chat` in `packages/shared/src/interviews.ts`.
- [ ] Export AI chat contract types from `packages/shared/src/index.ts`.
- [ ] Keep request contract aligned to documented Excalidraw snapshot expectations from `docs/system/system-design/api-routes.md` and `docs/system/system-design/frontend-pages.md`, not Mermaid as required request input.

### 2. Backend interview module wiring
- [ ] Add AI chat controller/service/repository wiring in `packages/shared-backend/src/interviews/` following existing interview module layering.
- [ ] Keep route/module additions scoped to AI chat ownership only and avoid unrelated interview lifecycle changes.

### 3. Backend route registration
- [ ] Register `POST /api/interviews/:id/ai-chat` in `apps/backend-rest/src/index.ts` using shared schemas consistently.
- [ ] Keep route registration aligned with documented route ownership and existing interview module patterns.

### 4. Module wiring validation coverage
- [ ] Add or update module wiring tests to prove shared schemas, controller/service boundaries, and route registration are connected correctly.
- [ ] Verify route-level request/response validation uses shared AI chat schemas consistently.

## Implementation Notes
- Scope here is contract and module wiring only.
- AI provider calls, prompt construction, frontend chat UX, and observability hardening belong to follow-up Milestone 4 stories.

## End Goal
Shared AI chat contracts and backend route/module wiring exist with test-backed schema boundaries, enabling later Milestone 4 stories to implement guarded behavior and AI integration without redefining route shape.
