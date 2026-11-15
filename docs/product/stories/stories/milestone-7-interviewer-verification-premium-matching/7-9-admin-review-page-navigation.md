# Story 7.9: Admin Review Page & Navigation

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Build the admin review page at `/admin/reviews` as a master-detail view with status filtering, offset pagination, guarded decisions, and conditional admin navigation derived from the canonical session's `isAdmin`.
**Status**: Completed

## What Needs to Be Done

### 1. Route & Guard
- [x] Add an `/admin/reviews` route beneath the existing authenticated route tree in `apps/frontend/src/routes/` (mirroring the `_authenticated` pattern) with its own `beforeLoad` role guard based on the canonical auth session `isAdmin`.
- [x] Non-admin users are redirected to `/dashboard`; unauthenticated access is inherited from the authenticated tree and routed to `/login`. The API remains the authority — the client guard is UX only.
- [x] Add a route direct-access test: admin allowed, non-admin redirected to dashboard, unauthenticated inherited to login.

### 2. Data Layer (TanStack Query + HTTP Transport)
- [x] Use TanStack Query with the existing HTTP transport; define query keys that include `status`, `limit`, `offset` for the list and the application ID for the detail.
- [x] List query fetches `GET /api/admin/applications` with the shared `AdminListQuery` contract; detail query fetches `GET /api/admin/applications/:id`; decision mutation posts `PATCH /api/admin/applications/:id` with `{ decision }`.
- [x] Handle later session loss explicitly: when an in-flight request returns `401` (session expired/revoked) or `403` (admin flag revoked), treat the page as no longer authorized — stop the pending mutation from mutating cache, clear the admin selection, and route the user to login (`401`) or `/dashboard` (`403`) while surfacing a session-lost state. Do not silently retry or cache-stale an authorization failure.
- [x] Define the smart component so list state (filter, offset) and selected-detail state live where they can drive both the list and detail panels.

### 3. Master-Detail UI & States
- [x] Render a master-detail layout: master list (`AdminApplicationSummary[]`) with a status filter (default `pending`, exactly `pending|approved|rejected`), offset pagination controls, and a detail panel (`AdminApplicationDetail`) for the selected application.
- [x] Provide loading, empty, and error states for both list and detail; on error show a retry path.
- [x] On decision success: update the detail cache from the response, invalidate all admin list query-key variants, and clear the current selection so the now-decided pending item disappears from the list.
- [x] On `409` (conflict / non-pending / concurrent / deleted): show a conflict state, invalidate/refetch the list and detail, and require the admin to re-confirm or re-select; do not mutate.
- [x] Deleted applicants: disable the approve action (per `isAccountDeleted`) while leaving reject enabled; no rejection reason is collected.

### 4. Decision Confirmation
- [x] Require a confirmation step before submitting any decision (approve or reject); on confirm, show a disabled/in-flight mutation state while the request is pending.
- [x] Do not collect or send a rejection reason or internal note in the MVP.

### 5. Smart/Dumb Separation
- [x] Keep business logic (data fetching, query invalidation, mutation, conflict handling, filter/pagination state) in a smart component and pure rendering in dumb component(s), separated into different files under `apps/frontend/src/components/`.
- [x] Do not combine smart and dumb logic in the same file.

### 6. Conditional Admin Navigation
- [x] In the actually used app shell path, `apps/frontend/src/components/layout/app-shell/app-shell-smart.tsx`, and `apps/frontend/src/components/layout/navigation/nav-items.ts`, derive nav items from the session `isAdmin` so an "Admin" entry (linking to `/admin/reviews`) appears only for admins.
- [x] Use the same admin list for both the sidebar and mobile nav; hide the admin entry entirely for non-admin users (no leaked admin route in their navigation tree).
- [x] Do not implement against unused `navigation-smart.tsx`; modify `app-shell-smart.tsx` and `nav-items.ts` as they are the components actually used.

### 7. Tests
- [x] Frontend tests: route direct access, list rendering, status filter behavior, pagination, detail rendering, loading/empty/error states, confirmation flow, mutation/cache update and invalidation, conflict handling on `409`, deleted-applicant behavior (approve disabled, reject allowed), nav visibility (owner/moderator `isAdmin: true` shows admin entry, normal `isAdmin: false` hides it), and later `401`/`403` session loss (redirect to login/`/dashboard`, no cache mutation on authorization failure).
- [x] Keep tests focused on smart component behavior and dumb component rendering separately.

### 8. Documentation
- [x] Update `docs/system/system-design/frontend-pages.md` to list the `/admin/reviews` master-detail page and its data sources (`GET /api/admin/applications`, `GET /api/admin/applications/:id`, `PATCH /api/admin/applications/:id`).
- [x] Update `docs/product/stories/milestones.md` (Admin Review area) and any relevant navigation/layout docs to reflect the admin review page and conditional admin nav entry.

## Implementation Notes
- The client route guard is UX-only; the backend `requireAdmin` API remains the authority and will reject non-admins regardless of the client.
- Master-detail and mutation/cache semantics must align with the API contract from the admin review API story (`docs/product/stories/stories/milestone-7-interviewer-verification-premium-matching/7-8-admin-review-api.md`), including offset pagination and summary-vs-detail field differences (no `employmentHistory` in summaries).
- No rejection reason/internal note is collected in MVP.

## End Goal
Admins reach a `/admin/reviews` master-detail page (gated by the canonical session `isAdmin`) where they can filter pending/approved/rejected applications, page through a stable offset-paginated list, view an application's full detail, and approve or reject it after a confirmation. Success updates the detail cache and removes the item from the pending list; conflicts refresh the list/detail and deleted applicants cannot be approved. Admin navigation appears in sidebar and mobile nav only for admins, and non-admins never see the admin entry or route.
