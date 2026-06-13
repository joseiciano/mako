# Story 3.3: Whiteboard Session Route and UI Shell

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Build the interview session route UI shell and join flow needed to host the collaborative whiteboard.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-2-whiteboard-provision-contract-and-backend-wiring.md`
- `docs/system/system-design/frontend-pages.md`

## What Needs to Be Done

### 1. Session route scaffolding and data boundaries
- [ ] Add TanStack Router route file(s) in `apps/frontend/src/routes/` for `/interviews/:id/session`.
- [ ] For Milestone 3 P2P scope, keep data dependencies limited to `GET /api/interviews/:id` and `POST /api/interviews/:id/provision` as defined in `docs/system/system-design/frontend-pages.md`.
- [ ] Keep `POST /api/interviews/:id/ai-chat` explicitly out of this story scope (AI-led session behavior owned by Milestone 4, beginning with `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-1-ai-chat-shared-contracts-and-module-wiring.md`).
- [ ] Update existing interview list route (`apps/frontend/src/routes/_authenticated.interviews.tsx`) with navigation into the session route where applicable.

### 2. Smart/dumb component split for the session screen
- [ ] Implement a smart component responsible for fetching/interview join actions and state transitions.
- [ ] Implement a dumb/presentational component that renders loading, join CTA, error, and whiteboard container states.
- [ ] Keep component structure aligned with existing frontend patterns in `apps/frontend/src/components/` and `apps/frontend/src/routes/`.

### 3. Join flow behavior
- [ ] Trigger provisioning only from explicit user join action.
- [ ] Prevent duplicate join/provision calls during in-flight state.
- [ ] Show clear user-facing fallback states when provision fails or returns incomplete whiteboard data.

### 4. Baseline frontend route/component tests
- [ ] Add/update route/component tests for join CTA visibility, loading states, error states, and successful whiteboard shell rendering.

## End Goal
The interview session route exists with a reliable join flow and UI shell that can host collaborative whiteboard integration without collapsing smart/dumb boundaries.
