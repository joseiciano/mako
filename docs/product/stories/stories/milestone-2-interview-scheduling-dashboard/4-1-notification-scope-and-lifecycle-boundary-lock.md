# Story 4.1: Notification Scope and Lifecycle Boundary Lock

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Lock notification orchestration scope and lifecycle boundaries so post-commit events remain the only trigger surface.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-8-interview-post-commit-events-and-notification-contract.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/diagrams.md`
- `docs/system/system-design/api-routes.md`

## What Needs to Be Done

### 1. Story ownership and source-of-truth lock
- [ ] Treat Story 4 subtasks (`4-1` through `4-6`) as the source-of-truth for Milestone 2 notification orchestration behavior.
- [ ] Keep Story `3-8` as producer-side integration compatibility coverage for CRUD create/cancel events, not as notification workflow ownership.
- [ ] Ensure Story `1-5` remains matcher post-commit boundary ownership and does not re-own notification workflow behavior.

### 2. Trigger boundary lock (post-commit only)
- [ ] Accept only post-commit interview lifecycle signals as notification triggers.
- [ ] Disallow in-transaction notification side effects for create/cancel/match paths.
- [ ] Keep create/cancel/match trigger boundaries aligned with:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/api-routes.md`

### 3. Explicit out-of-scope guardrails
- [ ] Keep Realtime and whiteboard provisioning out of scope for notification processing.
- [ ] Keep `POST /api/interviews/:id/provision` as join-time route behavior (not queue-triggered) per:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/infrastructure/backend.md`
  - `docs/infrastructure/management.md`
- [ ] Ensure immediate AI session provisioning behavior in `docs/system/system-design/api-routes.md` does not move provisioning ownership into notification workers.

### 4. Cross-story compatibility lock
- [ ] Keep notification boundaries compatible with:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-8-interview-post-commit-events-and-notification-contract.md`
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md`

## End Goal
Notification scope and lifecycle boundaries are explicitly locked so only post-commit events trigger orchestration, without leaking provisioning or transaction-owned responsibilities into notification workers.
