# Story 5.6: Scheduling Draft/Resume and Dashboard Continuity

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define leave-and-return behavior for in-progress scheduling and post-submit continuity back to dashboard/interview surfaces.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-5-scheduling-api-contract-integration-boundaries.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-1-dashboard-scope-and-contract-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-3-dashboard-data-hooks-and-query-contracts.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/state-management-lifecycle.md`

## What Needs to Be Done

### 1. Define leave-mid-flow and return semantics
- [ ] Define exactly what in-progress Scheduling Flow state is preserved when user leaves `/interviews/new` and later returns.
- [ ] Define whether preserved state is memory-only vs persisted client-side; do not assume server-side draft APIs that are not documented.
- [ ] If durable server draft behavior is desired, document and gate a dedicated route/contract story before implementation.

### 2. Define restored-state integrity rules
- [ ] Re-validate restored draft state against current step requirements before allowing final submit.
- [ ] Define invalidation/reset behavior when restored values conflict with current policy/contract rules.
- [ ] Ensure branch switch behavior after restore remains deterministic and does not keep stale incompatible fields.

### 3. Define post-submit continuity behavior
- [ ] Define default post-submit navigation targets aligned with `docs/system/system-design/frontend-pages.md`:
  - Dashboard (`/dashboard`) upcoming sessions context
  - Interviews list (`/interviews`) when applicable
- [ ] Define immediate AI success continuity (`scheduled_at: 'now'`) in a way that stays compatible with join-time provisioning boundaries.
- [ ] Define user feedback on success (confirmation state/message) and on failure (retry path preserving valid input).

### 4. Query/state sync after successful submission
- [ ] Define required TanStack Query invalidation/refetch behavior so dashboard/interview data reflects new scheduling outcomes after submit.
- [ ] Ensure continuity behavior does not introduce parallel server-state transport patterns outside established frontend hook conventions.

### 5. Continuity test coverage
- [ ] Add tests for leave-and-return state restoration behavior.
- [ ] Add tests for restored-state re-validation and invalidation behavior.
- [ ] Add tests for post-submit navigation and dashboard/interviews data refresh behavior.

## End Goal
Users can safely leave and resume Scheduling Flow without stale or ambiguous state, and successful submissions return them to consistent dashboard/interview experiences.
