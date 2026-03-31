# Story 1.5: Post-Commit Events and Lifecycle Boundaries

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Emit post-match orchestration signals only after successful commit while preserving join-time provisioning boundaries.
**Status**: Todo

## What Needs to Be Done

### 1. Post-commit event emission
- [ ] After successful DB commit, emit a post-match event/message for downstream orchestration (IDs for interview and both users).
- [ ] Ensure event emission is commit-safe (do not emit if transaction rolls back).

### 2. Lifecycle boundary enforcement
- [ ] Keep this story aligned with lifecycle docs: **do not provision live Realtime/whiteboard sessions during matching**.
- [ ] Keep session provisioning as join-time behavior (`POST /api/interviews/:id/provision`) per:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/api-routes.md`

### 3. Downstream integration compatibility
- [ ] Ensure notification/reminder orchestration is integration-compatible with Milestone 2 Story 4 notification subtasks:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-4-confirmation-and-reminder-workflow-rules.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-5-cancellation-reminder-suppression-rules.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-6-notification-integration-tests-and-drift-gates.md`
- [ ] Ensure event transport is compatible with the queue/worker hand-off infrastructure defined in `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`.

### 4. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with previous stories: `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md` and `docs/product/stories/milestones.md`.
- [ ] Confirm no discrepancy with `docs/system/system-design/state-management-lifecycle.md`, `docs/system/system-design/diagrams.md`, and `docs/system/system-design/api-routes.md`.
- [ ] If any discrepancy is found, update story details before implementation.

## End Goal
Successful matches trigger downstream orchestration safely after commit, while Realtime/whiteboard provisioning remains strictly outside the matcher and tied to the join flow.
