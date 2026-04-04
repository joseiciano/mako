# Story 1.5: Post-Commit Events and Lifecycle Boundaries

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Emit post-match orchestration signals only after successful commit while preserving join-time provisioning boundaries.
**Status**: Completed
**Last reconciled**: 2026-04-04 (Story 1.5 implementation)

## What Needs to Be Done

### 1. Post-commit event emission
- [x] After successful DB commit, emit a post-match event/message for downstream orchestration (IDs for interview and both users).
- [x] Ensure event emission is commit-safe (do not emit if transaction rolls back).

### 2. Lifecycle boundary enforcement
- [x] Keep this story aligned with lifecycle docs: **do not provision live Realtime/whiteboard sessions during matching**.
- [x] Keep session provisioning as join-time behavior (`POST /api/interviews/:id/provision`) per:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/api-routes.md`

### 3. Downstream integration compatibility
- [x] Ensure notification/reminder orchestration is integration-compatible with Milestone 2 Story 4 notification subtasks:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-4-confirmation-and-reminder-workflow-rules.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-5-cancellation-reminder-suppression-rules.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-6-notification-integration-tests-and-drift-gates.md`
- [x] Ensure event transport is compatible with the queue/worker hand-off infrastructure defined in `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md`.

## Implementation Notes

- Added matcher post-commit event contract + builder in `packages/shared-backend/src/matcher/matcher-post-commit-event.ts` using snake_case normalized fields aligned to Story 4 event envelope conventions.
- Updated transactional write result shape in `packages/shared-backend/src/matcher/types.ts` and `packages/shared-backend/src/matcher/matcher-repository.ts` so post-commit emission has deterministic participant IDs from the committed interview row.
- Added post-commit publisher boundary in `packages/shared-backend/src/matcher/matcher-execution-service.ts`; events are emitted only after successful transaction commit.
- Added test coverage for repository write outputs, execution service emission boundaries, rollback/no-emission behavior, and event contract requiredness in:
  - `packages/shared-backend/src/matcher/matcher-repository.test.ts`
  - `packages/shared-backend/src/matcher/matcher-execution-service.test.ts`
  - `packages/shared-backend/src/matcher/matcher-post-commit-event.test.ts`

## End Goal
Successful matches trigger downstream orchestration safely after commit, while Realtime/whiteboard provisioning remains strictly outside the matcher and tied to the join flow.
