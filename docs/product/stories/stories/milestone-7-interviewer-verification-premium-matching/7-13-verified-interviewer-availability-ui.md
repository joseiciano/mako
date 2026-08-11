# Story 7.13: Verified Interviewer Availability UI

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Build the verified-interviewer availability management UI to publish exact 60-minute premium slots, view their first-to-claim inventory, and cancel still-available slots, using the Story 7.11 shared contracts and the Story 7.12 API. The published interview type is fixed to `system_design`.
**Status**: Completed

## What Needs to Be Done

### 1. Placement, route, and data layer
- [x] Add the TanStack Router file `apps/frontend/src/routes/_authenticated.settings.interviewer-availability.tsx`, rendering the availability management page at `/settings/interviewer-availability` under the existing authenticated route tree.
- [x] Add a **Settings link** to `/settings/interviewer-availability` shown only when `GET /api/account` returns `isVerifiedInterviewer: true` (the Story 7.11 current-user projection of `"user".companies`). Non-verified users do not see the link, and the route redirects non-verified users away. This frontend gate is presentation-only; Story 7.12 remains the authorization authority.
- [x] Add premium availability hooks/transport in `apps/frontend/src/hooks/use-premium-availability.ts` using the Story 7.11 shared schemas and the Story 7.12 routes (`POST /api/premium/interviewer/slots`, `GET /api/premium/interviewer/slots`, `DELETE /api/premium/interviewer/slots/:id`).
- [x] Use TanStack Query for server state, with separate query keys for the interviewer's published slots and for the account/eligibility status.
- [x] After a successful publish or cancel mutation, invalidate/refetch the interviewer's slots query so the list reflects the server-owned `available`/`claimed`/`cancelled` status rather than optimistic local assumptions.

### 2. Publish availability flow (fixed system_design)
- [x] In a smart component, build a publish form that collects a `startTime` and submits `{ interviewType: 'system_design', startTime }`; never submit `endTime`, `status`, or `interviewerId`.
- [x] The publish form offers **no** interview-type selector. The interview type is fixed to `system_design` and there are no coding/behavioral controls in this UI. The shared contract still preserves `coding | behavioral` for future compatibility, but this UI only ever publishes `system_design`.
- [x] Enforce client-side min/max date bounds from the active Story 7.11 policy metadata returned by the owner-list `policy` field (server defaults: `leadTimeMinutes: 60`, `horizonDays: 90`), and reflect backend `400`/`409` errors with readable messages when the window is out of bounds or conflicts.
- [x] Show loading, error, and empty states; surface backend validation/conflict errors (lead/horizon, overlap, scheduled/ongoing interview conflict) with a retry path that preserves the user's typed inputs.

### 3. Inventory list and cancel
- [x] Request the owner list with `interviewType=system_design` and render those slots with server-owned status badges (`available`/`claimed`/`cancelled`), the `system_design` type label, and the 60-minute window.
- [x] Provide a cancel affordance only for `available` slots. A `claimed` slot must render as non-cancellable (it is held by a scheduler) and a `cancelled` slot as terminal with no cancel affordance.
- [x] On cancel, call the DELETE route; refetch on success and reconcile a `409` (slot became claimed concurrently) by invalidating and re-rendering the server state.
- [x] Show an empty-inventory state with a direct call-to-action to publish a slot.

### 4. Smart/Dumb separation and accessibility
- [x] Keep data fetching, eligibility gating, mutation, cache invalidation, and conflict handling in a smart component; keep publish-form and inventory rendering in separate dumb component files.
- [x] Use accessible form semantics (labels, clear date/time inputs, validation messaging associated with controls), and move focus to the first actionable error after a failed publish.
- [x] Ensure disabled cancel buttons and status badges convey state to assistive technology (not just color).

### 5. Tests and documentation
- [x] Add hook/transport tests proving publish requests contain exactly `{ interviewType: 'system_design', startTime }` with no type selector and no `endTime`/`status`/`interviewerId`, list/cancel use the correct routes, and mutations invalidate the slots query.
- [x] Add smart-component tests for the verified-only Settings link/route gate, publish success/error/conflict handling, cancel-only-for-available, and concurrent `409` reconciliation.
- [x] Add dumb-component tests for status badges, 60-minute window rendering, empty inventory, and accessibility labels.
- [x] Update `docs/system/system-design/frontend-pages.md`: add the `/settings/interviewer-availability` page, note it is linked from Settings only for verified users, and document that it publishes fixed `system_design` slots (no coding/behavioral controls).

## Implementation Notes
- **Prerequisites**: Story 7.11 (shared contracts + policy metadata), Story 7.12 (availability API), and the existing frontend app shell/auth conventions in `docs/infrastructure/frontend.md` and `docs/coding/frontend-instructions.md`.
- This UI is for verified interviewers managing the slots they offer; it is distinct from the scheduler-facing marketplace booking UI in Story 7.16.
- The Premium UI is system-design-only: this ticket publishes a fixed `interviewType = 'system_design'` and offers no coding/behavioral controls. The shared/backend contracts preserve the full enum values (`system_design | coding | behavioral`) for future compatibility; this UI simply never produces the other values.
- No interviewer charge/compensation/payout concepts are introduced in the UI; interviewers publish slots as free inventory.

## End Goal
Verified interviewers can publish fixed-`system_design` 60-minute premium slots with validated bounds, see their first-to-claim inventory with server-owned statuses, and cancel only still-available slots — all at `/settings/interviewer-availability`, linked from Settings only for verified users, with clear states, accessibility, and tests, driven by the Story 7.11 contracts.
