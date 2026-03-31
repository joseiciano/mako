# Story: Scheduling Flow

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Create the multi-step form for selecting interview type, mode (P2P/AI), and timing.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/api-routes.md`
**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

## What Needs to Be Done

### 1. Flow scope and ownership lock
- [ ] Define this story as the frontend scheduling UX orchestration ticket for type/mode/time selection.
- [ ] Keep backend write ownership in Story 3 route tickets (`3-5`, `3-6`, `3-7`) and shared contracts in Story `3-4`.

### 2. Step-by-step scheduling UX definition
- [ ] Define explicit steps for:
  - interview type selection
  - mode selection (P2P vs AI)
  - tier/constraints selection (if applicable)
  - timing selection and confirmation
- [ ] Document forward/back navigation rules and step completion requirements.

### 3. Validation and guardrail behavior
- [ ] Define per-step validation requirements and user-facing error states.
- [ ] Ensure unavailable combinations (mode/type/tier/time) are blocked before submission.
- [ ] Define disabled/loading states for submit and retry paths.

### 4. API contract integration boundaries
- [ ] Bind final submission payload to shared contracts used by `POST /api/interviews`.
- [ ] Keep this story aligned with:
  - `docs/system/system-design/api-routes.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`
- [ ] Ensure create success/failure UX is explicitly documented.

### 5. Draft/save-return and dashboard continuity
- [ ] Define expected behavior when users leave mid-flow and return.
- [ ] Define post-submit navigation behavior back to dashboard/interview list.

### 6. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with scheduling lifecycle boundaries in:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
- [ ] Confirm no discrepancy with queue/notification ownership in:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md`
- [ ] If discrepancies exist, update docs before implementation.

## End Goal
Scheduling flow requirements are fully specified with actionable, testable checklist items and explicit route/lifecycle boundaries so implementation can proceed without ambiguity.
