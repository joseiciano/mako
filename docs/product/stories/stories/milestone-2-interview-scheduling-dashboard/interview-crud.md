# Story 3: Interview CRUD

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement the backend contracts and route handlers for creating, listing, and cancelling interviews, with explicit lifecycle boundaries and no drift from system design.
**Status**: Todo

## What Needs to Be Done

### 1. Scope and source-of-truth lock
- [ ] Lock this story to exactly these routes from `docs/system/system-design/api-routes.md`:
  - `POST /api/interviews`
  - `GET /api/interviews`
  - `POST /api/interviews/:id/cancel`
- [ ] Keep `POST /api/interviews/:id/provision` and `GET /api/interviews/:id` out of scope for this story.
- [ ] Keep lifecycle boundaries aligned with `docs/system/system-design/state-management-lifecycle.md` and `docs/system/system-design/diagrams.md`:
  - interview creation/cancellation here is data-state management only
  - realtime session provisioning remains join-time behavior (`POST /api/interviews/:id/provision`)

### 2. Locked product rules for mode/tier behavior
- [ ] Implement against these locked rules for this story:
  - **AI-led** interviews are quota/credit-gated by account limits (`free_ai_interviews`/credits).
  - **Premium** is treated as an account limit-policy input (how many interviews an account can run), not as a different scheduling flow in this story.
  - Premium limit policy must be configurable (not hardcoded), since values may change.
  - `interviewer_id` is out of scope for this story's creation path.
  - Free user scheduling paths are: AI-led via `POST /api/interviews`, or Standard peer-to-peer via availability matcher flow.
  - Direct peer-to-peer interview creation is **not supported** in this story.
- [ ] Encode and document the valid creation matrix for `(mode, tier, interviewer_id, scheduled_at)` in shared schema + service validation so unsupported combinations fail predictably.
- [ ] Align and update source-of-truth docs (at minimum `docs/system/system-design/api-routes.md` and `docs/system/system-design/matching-tiers.md`) before implementation if they still suggest unsupported direct peer-to-peer creation.

### 3. Database and migration readiness
- [ ] Ensure the `interviews` schema used by this story matches `docs/system/system-design/db-schemas.md` exactly (columns, enum values, optional fields, timestamps).
- [ ] If any required DB shape is missing in migrations, add/adjust migration files in `packages/shared-backend/migrations/*.sql` per `docs/system/system-design/db-schemas.md`.
- [ ] Ensure listing and cancellation queries are index-aware; if new indexes are required, document them in `docs/system/system-design/db-schemas.md` before adding migration SQL.

### 4. Backend module implementation (controller/service/repository)
- [ ] Implement interview backend modules in shared-backend following existing account layering patterns:
  - `packages/shared-backend/src/interviews/interview-repository.ts`
  - `packages/shared-backend/src/interviews/interview-service.ts`
  - `packages/shared-backend/src/interviews/interview-controller.ts`
  - `packages/shared-backend/src/interviews/types.ts`
  - `packages/shared-backend/src/interviews/index.ts`
- [ ] Define shared request/response schemas and types in:
  - `packages/shared/src/interviews.ts`
  - and export from `packages/shared/src/index.ts`
- [ ] Register the interview controller in:
  - `apps/backend-rest/src/index.ts`

### 5. Create interview behavior (`POST /api/interviews`)
- [ ] Require authenticated session and reject unauthenticated requests.
- [ ] Validate request body with Zod using the route contract in `docs/system/system-design/api-routes.md`.
- [ ] Accept AI-led creation path for this story; reject unsupported direct peer-to-peer creation path with a clear validation/business-rule error.
- [ ] Implement deterministic write behavior for `interviews` row creation:
  - `status = 'scheduled'` at creation
  - `scheduler_id` from authenticated user
  - `scheduled_at` handling for ISO timestamp vs `'now'` based on the resolved contract
  - `interviewer_id` rejected for this story's route scope
  - `tier` consumed as policy input for limit checks only in this story
  - alias fields handled by explicit mode/tier rules (no implicit behavior)
- [ ] Define and centralize alias generation policy for `scheduler_alias` / `interviewer_alias` in one helper, and ensure compatibility with matcher dependency noted in `1-3-transactional-match-and-interview-write.md`.

### 6. List interviews behavior (`GET /api/interviews`)
- [ ] Return interviews where the authenticated user is a participant (`scheduler_id` or `interviewer_id`).
- [ ] Support query params exactly as defined in `docs/system/system-design/api-routes.md`:
  - `status?`
  - `limit?`
  - `offset?`
- [ ] Implement stable ordering and pagination behavior explicitly (documented in code/tests) so repeated calls are deterministic.

### 7. Cancel interview behavior (`POST /api/interviews/:id/cancel`)
- [ ] Enforce participant ownership checks (only users tied to the interview can cancel it).
- [ ] Enforce valid-state cancellation rules per lifecycle docs (no invalid transitions).
- [ ] Perform cancellation as an atomic DB update to `status = 'cancelled'` with `updated_at` mutation.
- [ ] Keep cancellation idempotent behavior explicitly defined and tested (same request retry should not corrupt state).

### 8. Post-commit integration boundaries
- [ ] Keep this story integration-compatible with `notification-service.md` by defining a clear post-commit event payload contract for create/cancel paths.
- [ ] Do not send reminder/confirmation orchestration from inside transaction scope; emit only after successful commit.
- [ ] Keep infra/runtime expectations aligned with:
  - `docs/infrastructure/backend.md`
  - `docs/infrastructure/management.md`
  - `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`

### 9. Testing and drift-prevention gates (required)
- [ ] Add repository/service/controller tests for:
  - create validation matrix
  - participant-scoped list behavior
  - cancellation ownership and state transitions
  - idempotent cancellation retry behavior
- [ ] Confirm no discrepancy with previous stories:
  - `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`
  - `docs/product/stories/stories/milestone-1-foundation-authentication/1-3-database-migration-system.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-1-matcher-scope-and-dependencies.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-3-transactional-match-and-interview-write.md`
  - `docs/product/stories/milestones.md`
- [ ] Confirm no discrepancy with design docs:
  - `docs/infrastructure/backend.md`
  - `docs/infrastructure/management.md`
  - `docs/system/system-design/api-routes.md`
  - `docs/system/system-design/db-schemas.md`
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/matching-tiers.md`
  - `docs/system/system-design/frontend-pages.md`
- [ ] If any discrepancy is found, update the relevant docs/story text first so implementation has one unambiguous source of truth.

## End Goal
Interview CRUD is fully specified as Story 3 with clear route contracts, DB expectations, lifecycle boundaries, and integration points, so developers can implement create/list/cancel behavior without ambiguity or drift from existing milestone and infrastructure/system design documentation.
