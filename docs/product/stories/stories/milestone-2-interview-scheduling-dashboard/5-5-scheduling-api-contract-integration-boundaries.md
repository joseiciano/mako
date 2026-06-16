# Story 5.5: Scheduling API Contract Integration Boundaries

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Bind Scheduling Flow submissions to documented API contracts for AI create and P2P availability while preserving route/lifecycle ownership boundaries.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-3-scheduling-validation-and-guardrail-behavior.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-4-availability-route-post-api-availability.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/state-management-lifecycle.md`

## What Needs to Be Done

### 1. Define branch-to-route submission mapping
- [x] AI-led branch must submit to `POST /api/interviews` using the route contract shape from `docs/system/system-design/api-routes.md`.
- [x] P2P branch must submit to `POST /api/availability` using the route contract shape from `docs/system/system-design/api-routes.md`.
- [x] Keep branch mapping deterministic and explicit in code/docs (no inferred fallback route selection).

### 2. Contract/schema binding requirements
- [x] Bind AI create payload to shared interview contracts owned by Story `3-4`.
- [x] Bind P2P availability payload to shared availability contracts owned by Story `5-4`.
- [x] Do not include client-selected `tier` in Scheduling Flow submission payloads; account policy/tier resolution is backend-owned.
- [x] Ensure frontend payload parsing/typing and server response handling stay aligned with documented route fields and enum values.

### 3. Success and failure UX definitions per branch
- [x] Define AI submit success behavior for:
  - future-scheduled sessions
  - immediate AI (`scheduled_at: 'now'`) sessions
- [x] Define P2P submit success behavior (availability request accepted for matcher processing), including explicit asynchronous messaging that interview rows appear only after matcher success.
- [x] Define branch-specific failure behavior with explicit, user-visible retry actions and no hidden contract assumptions.

### 4. Lifecycle/ownership guardrails during submission
- [x] Keep this story limited to frontend submission UX and mutation wiring.
- [x] Do not move lifecycle state transition ownership into frontend logic beyond invoking documented routes.
- [x] Keep notification and provisioning boundaries aligned with:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`

### 5. Integration test coverage for contract boundaries
- [x] Add tests proving AI branch dispatches only `POST /api/interviews` contract-shaped payloads.
- [x] Add tests proving P2P branch dispatches only `POST /api/availability` contract-shaped payloads.
- [x] Add tests for success/failure mutation handling per branch.

## End Goal
Scheduling Flow submissions are contract-accurate for both AI and P2P channels, with explicit branch routing, safe error handling, and no lifecycle ownership drift.
