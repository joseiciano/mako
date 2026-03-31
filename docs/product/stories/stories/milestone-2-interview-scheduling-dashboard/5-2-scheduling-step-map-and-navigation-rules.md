# Story 5.2: Scheduling Step Map and Navigation Rules

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define the exact multi-step flow graph for `/interviews/new`, including AI and P2P branch navigation and completion criteria.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-1-scheduling-flow-scope-and-ownership-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/6-1-availability-route-post-api-availability.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/matching-tiers.md`

## What Needs to Be Done

### 1. Define explicit branched step graph
- [ ] Define the Scheduling Flow steps in explicit order with branch behavior:
  - Step 1: interview type selection (current Story 5 UI scope: `system_design`; preserve forward-compatible contract awareness for additional documented types)
  - Step 2: mode selection (`ai_led | peer_to_peer`)
  - Step 3A (AI branch): timing selection (`scheduled_at` as ISO or `'now'`); account policy/tier is resolved server-side
  - Step 3B (P2P branch): availability input for matcher path (`interview_type`, `max_matches`, one or more 60-minute slots)
  - Step 4: confirmation summary before submit
- [ ] Ensure step graph aligns with channel rules from `docs/system/system-design/matching-tiers.md` and `docs/system/system-design/api-routes.md`.

### 2. Define forward/back and editing behavior
- [ ] Document next/back rules for each step, including when users change type/mode after filling downstream fields.
- [ ] Define reset rules when branch-changing input invalidates downstream state (for example, switching `ai_led` <-> `peer_to_peer`).
- [ ] Define whether confirmation step allows in-place edit links back to prior steps and how state re-validation happens after edits.

### 3. Define per-step completion gates
- [ ] Define exact completion requirements for every step before “Next” is enabled.
- [ ] Ensure branch-specific required fields are enforced before confirmation is accessible.
- [ ] Ensure no network submission is attempted before confirmation step passes branch-complete validation.

### 4. Route architecture and state ownership definition
- [ ] Keep route entry under authenticated route chain (`_authenticated`) consistent with Dashboard/Auth patterns.
- [ ] Define Scheduling Flow smart/dumb split for route UI orchestration vs presentation, aligned with `docs/coding/frontend-instructions.md`.
- [ ] Keep client-only step state ownership aligned with frontend stack guidance in `docs/infrastructure/frontend.md` (TanStack Store for UI state, TanStack Query for server state/mutations).

### 5. Step-map test coverage requirements
- [ ] Add route/smart-level tests that prove:
  - allowed step progression
  - blocked progression when incomplete
  - back navigation preserves valid state
  - branch switch resets invalid downstream state deterministically

## End Goal
The scheduling step map is fully explicit and testable, with deterministic branch navigation and completion rules for both AI-led and P2P paths.
