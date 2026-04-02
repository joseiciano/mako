# Story 5.1: Scheduling Flow Scope and Ownership Lock

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Lock `/interviews/new` scope, source-of-truth references, and ownership boundaries before implementing the scheduling flow.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-4-availability-route-post-api-availability.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/matching-tiers.md`

## What Needs to Be Done

### 1. Source-of-truth lock for scheduling UX
- [ ] Treat `docs/system/system-design/frontend-pages.md` as the source of truth for `Schedule Interview (/interviews/new)` behavior.
- [ ] Treat Story 5 split (`5-1` through `5-6`) as the canonical implementation breakdown for Scheduling Flow.
- [ ] Keep this Story 5 scope limited to frontend scheduling orchestration (step flow, validation UX, submission UX, continuity UX).
- [ ] Keep Story 5 UI scope to `system_design` type for current implementation, while preserving route-contract compatibility for additional documented interview types.

### 2. Ownership boundary lock (no backend drift)
- [ ] Keep backend write ownership for `POST /api/interviews` in Story `3-5` and shared interview contracts in Story `3-4`.
- [ ] Keep backend write + contract ownership for `POST /api/availability` in Story `5-4`.
- [ ] Keep Standard P2P creation ownership with availability + matcher flow per:
  - `docs/system/system-design/frontend-pages.md`
  - `docs/system/system-design/api-routes.md`
  - `docs/system/system-design/matching-tiers.md`
- [ ] Do not move lifecycle write ownership, queue orchestration ownership, or join-time provisioning ownership into Story 5.

### 3. Dependency gate lock for both scheduling channels
- [ ] Explicitly lock Scheduling Flow to two submission channels only:
  - AI-led scheduling path -> `POST /api/interviews`
  - P2P availability path -> `POST /api/availability`
- [ ] Treat Story `5-4` as the dependency gate for P2P availability contracts/ownership before Scheduling Flow submission wiring.

### 4. Explicit out-of-scope guardrails
- [ ] Keep notification transport/orchestration ownership in Story 4 (`4-1` through `4-6`), not in Scheduling Flow tickets.
- [ ] Keep join-time provisioning ownership in `POST /api/interviews/:id/provision` boundaries from:
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/infrastructure/backend.md`


## End Goal
Scheduling Flow ownership is unambiguous and locked to frontend orchestration for documented AI and P2P channels, with no backend lifecycle or notification boundary drift.
