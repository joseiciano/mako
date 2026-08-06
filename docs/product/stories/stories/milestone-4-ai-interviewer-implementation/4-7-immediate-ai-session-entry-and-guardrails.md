# Story 4.7: Immediate AI Session Entry and Guardrails

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Deliver AI-only "Start Now" entry behavior so users can create immediate AI sessions under existing create-route, quota, and retry guardrails.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/matching-tiers.md`
- `docs/system/system-design/db-schemas.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-5-scheduling-api-contract-integration-boundaries.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-6-scheduling-draft-save-return-and-dashboard-continuity.md`

## What Needs to Be Done

### 1. Implement AI-only "Start Now" entry behavior
- [x] Implement exact "Start Now" UX entry inside AI scheduling flow using documented AI immediate timing behavior (`scheduled_at: 'now'`).
- [x] Keep "Start Now" limited to `mode: 'ai_led'`; direct `peer_to_peer` immediate creation remains unsupported and must stay on availability and matcher path.
- [x] Keep create payload aligned with `POST /api/interviews` contract: no client-selected `tier`, no `interviewer_id`, and current UI scope remains compatible with `system_design` first.

### 2. Implement quota, credit, and create-path guardrails
- [x] Surface account-policy gating for immediate AI sessions using existing free-AI-quota and credit rules from `docs/system/system-design/matching-tiers.md` and `docs/system/system-design/db-schemas.md`.
- [x] Prevent duplicate immediate-session creation from double-click, refresh, or retry behavior in frontend mutation handling.
- [x] Define explicit user-facing behavior for insufficient quota or credits, create-route validation failures, and retryable transport failures without implying session has already started.

### 3. Preserve ordinary scheduling continuity boundaries
- [x] Keep immediate AI create behavior separate from ordinary future scheduling success and draft-continuity behavior.
- [x] Ensure immediate-entry UX does not regress existing scheduled-interview flow behavior in current scheduling route surfaces.

### 4. Add immediate-entry coverage
- [x] Add tests covering accepted immediate AI create flow (`scheduled_at: 'now'`) through successful creation response.
- [x] Add tests proving unsupported combinations stay blocked (`peer_to_peer` immediate path, client-selected `tier`, direct `interviewer_id`).
- [x] Add tests proving repeated submit attempts do not create duplicate interviews.

## Implementation Notes
- Scope here is immediate AI entry and create-path guardrails, not post-create session orchestration.
- Backend create semantics for `scheduled_at: 'now'` already belong to documented `POST /api/interviews` behavior; this story focuses on frontend product flow around that contract.
- Do not add new interview statuses, queue-driven provisioning, or hidden client-only lifecycle state.

## End Goal
User can choose AI "Start Now" and create an immediate AI interview under existing quota, credit, and contract rules with safe retry behavior and no drift from documented create-route ownership.
