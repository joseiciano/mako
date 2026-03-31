# Story 2.4: Dashboard UI States & List Rendering

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Build Dashboard visual presentation for quick stats and upcoming interviews, including complete UI states and route-safe details affordances.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-2-dashboard-route-architecture-and-auth-integration.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/2-3-dashboard-data-hooks-and-query-contracts.md`

## What Needs to Be Done

### 1. Implement quick stats cards from account data
- [ ] Render credits balance card.
- [ ] Render free standard interview balance card.
- [ ] Render free AI interview balance card.
- [ ] Keep stat labels and values consistent with account contract fields from `docs/system/system-design/api-routes.md`.

### 2. Implement upcoming interviews list rendering
- [ ] Render upcoming interview rows from scheduled-only interview query data.
- [ ] Include, at minimum, each interview row field:
  - type
  - mode
  - status
  - scheduled time
  - counterpart alias (from interview alias fields, not profile identity fields)
- [ ] Apply explicit counterpart alias selection rule in UI logic:
  - if viewer user id matches `schedulerId`, display `interviewerAlias`
  - otherwise display `schedulerAlias`

### 3. Implement details affordance with safe fallback
- [ ] For each interview row, render details affordance aligned to route availability.
- [ ] Navigate to `/interviews/:id` only when that route behavior is implemented and available.
- [ ] Otherwise, render a non-broken fallback affordance (for example, disabled “Details coming soon”).
- [ ] Do not use undocumented endpoints or hidden route assumptions to power details behavior.

### 4. Implement complete dashboard UI states
- [ ] Loading state
- [ ] Error state
- [ ] Empty upcoming interviews state
- [ ] Populated state
- [ ] Ensure state transitions are clear and accessible to users.

### 5. Keep styling and UX aligned with existing frontend patterns
- [ ] Use Tailwind and existing authenticated-page conventions.
- [ ] Keep visual language consistent with current route pages and app shell styling.
- [ ] Keep implementation aligned with `docs/infrastructure/frontend.md` and `docs/coding/frontend-instructions.md`.

### 6. Add dashboard smart/presentation test coverage
- [ ] Add tests for dashboard smart component state rendering:
  - loading state
  - error state
  - empty scheduled interviews state
  - populated state
- [ ] Add tests verifying quick stats cards render contract-backed account values (credits and free balances).
- [ ] Add tests for counterpart alias selection logic:
  - scheduler view shows interviewer alias
  - non-scheduler participant view shows scheduler alias
- [ ] Add tests for details affordance fallback behavior when `/interviews/:id` route behavior is not yet available.

## End Goal
Dashboard presents account quick stats and scheduled interviews with clear, complete UI states and safe route affordances, with smart and presentation behavior covered by tests.
