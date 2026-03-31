# Story 2: Dashboard UI

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement the authenticated `/dashboard` page as the user’s central hub for upcoming interview sessions and account quick stats.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-1-foundation-authentication/3-3-layout-integration.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/2-1-user-profile-quotas.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/interview-crud.md` (for `GET /api/interviews` availability)

## What Needs to Be Done

### 1. Lock story scope to documented Dashboard behavior
- [ ] Implement only the `/dashboard` scope defined in `docs/system/system-design/frontend-pages.md`:
  - upcoming interviews
  - quick stats (credits/free balances)
- [ ] Keep this story aligned with Milestone 2 scope in `docs/product/stories/milestones.md` and MVP direction in `docs/product/system-pitch.md`.
- [ ] Keep out of scope for this story: interview creation flow (`/interviews/new`), cancellation actions, and full interview history page behavior (`/interviews`).
- [ ] Resolve any scope discrepancy against referenced source docs before implementation of this section.

### 2. Implement page architecture under authenticated routing
- [ ] Keep route entrypoint at `apps/frontend/src/routes/_authenticated.dashboard.tsx` (existing protected route from Story 3.3).
- [ ] Refactor Dashboard route to smart-dumb page structure per `docs/coding/frontend-instructions.md`:
  - `apps/frontend/src/routes/dashboard/dashboard-smart.tsx`
  - `apps/frontend/src/routes/dashboard/dashboard-dumb.tsx`
- [ ] Ensure smart component handles data orchestration/auth-aware behavior and dumb component only handles rendering.
- [ ] Keep auth behavior consistent with existing authenticated route guard flow from Story 3.3; do not introduce dashboard-specific auth guard behavior that diverges from `_authenticated` routing.

### 3. Implement data fetching with documented APIs and existing frontend patterns
- [ ] Fetch account summary from `GET /api/account` (source-of-truth docs: `docs/system/system-design/api-routes.md`, `docs/system/system-design/frontend-pages.md`).
- [ ] Fetch upcoming sessions from `GET /api/interviews?status=scheduled` (same source-of-truth docs as above).
- [ ] Use TanStack Query for all dashboard server-state reads (per `docs/infrastructure/frontend.md` and `docs/coding/frontend-instructions.md`), not manual `useEffect`/local loading orchestration.
- [ ] Reuse existing account query patterns from `apps/frontend/src/hooks/use-account.ts`; add a dedicated interview list hook (for scheduled dashboard data) in `apps/frontend/src/hooks/`.
- [ ] Validate/parse API payloads with Zod-backed schemas from shared contracts where available; do not introduce undocumented response shapes.
- [ ] Use the documented `GET /api/interviews` list response fields (including alias + scheduling fields) from `docs/system/system-design/api-routes.md`; if shared schema/contracts differ, update story/docs first, then implement.
- [ ] Follow the same session transport pattern already used by existing frontend hooks until Better Auth backend Story 4.1 is completed; do not create a second dashboard-only auth transport path.

### 4. Build dashboard UI states and data presentation
- [ ] Implement quick stat cards for:
  - credits balance
  - free standard interview balance
  - free AI interview balance
- [ ] Implement an upcoming interviews list showing, at minimum, interview:
  - type
  - mode
  - status
  - scheduled time
  - counterpart alias (using interview alias fields, not personal profile details)
- [ ] Each interview row should include a details affordance aligned to current route availability:
  - navigate to `/interviews/:id` when that route is implemented
  - otherwise, render a non-broken fallback affordance (e.g., disabled “Details coming soon”) and avoid undocumented endpoint usage.
- [ ] Implement complete UI states in dashboard render logic:
  - loading state
  - error state
  - empty upcoming interviews state
  - populated state
- [ ] Keep styling aligned with existing frontend stack and page patterns (`docs/infrastructure/frontend.md`, Tailwind usage across authenticated route pages).
- [ ] Resolve any UI-level discrepancy against referenced docs during this section before implementation continues.

## End Goal
The `/dashboard` route is a production-ready authenticated hub that uses TanStack Query-driven API data to show account balances and upcoming scheduled interviews, with clear loading/error/empty states and no scope drift from Milestone 2 stories or system/infrastructure design documents.
