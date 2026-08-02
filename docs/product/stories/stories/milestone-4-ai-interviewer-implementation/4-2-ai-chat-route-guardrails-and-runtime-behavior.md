# Story 4.2: AI Chat Route Guardrails and Runtime Behavior

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Implement participant-safe backend behavior for `POST /api/interviews/:id/ai-chat` with explicit auth, mode, and lifecycle guardrails.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/db-schemas.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-1-ai-chat-shared-contracts-and-module-wiring.md`

## What Needs to Be Done

### 1. Participant-only authorization behavior
- [x] Require authenticated participant access for `POST /api/interviews/:id/ai-chat`.
- [x] Reject non-participant and unauthenticated requests with explicit route-level errors.

### 2. Interview mode and lifecycle guardrails
- [x] Enforce `mode = 'ai_led'` and reject peer-to-peer interviews for this endpoint.
- [x] Keep route behavior as runtime-only guidance and do not mutate interview lifecycle `status` ownership.
- [x] Keep behavior aligned with `docs/system/system-design/state-management-lifecycle.md` so chat turns do not take over start/end/timer responsibilities.

### 3. Backend failure semantics
- [x] Return documented response shape for valid requests and explicit failures for invalid mode, missing interview, or unauthorized access.
- [x] Keep validation and error handling isolated to AI chat route scope without changing existing provision/start/end route behavior.

### 4. Guardrail-focused backend tests
- [x] Add backend tests for auth rejection, participant-only access, mode guard behavior, and no-lifecycle-mutation behavior.
- [x] Add tests covering request validation and explicit failure responses for unsupported paths.

## Implementation Notes
- This story stops at guarded backend route behavior.
- AI Gateway calls and prompt behavior belong to follow-up AI integration story.

## End Goal
`POST /api/interviews/:id/ai-chat` safely accepts only valid AI-led participant requests, preserves lifecycle ownership boundaries, and rejects unsupported access paths with meaningful test coverage.
