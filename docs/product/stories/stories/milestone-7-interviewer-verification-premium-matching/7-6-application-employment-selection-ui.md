# Story 7.6: Interviewer Application Employment Selection UI

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Build the interviewer application UI with canonical employment-record selection and render the server-owned immutable snapshot after submission.
**Status**: Todo

## What Needs to Be Done

### 1. Route & Navigation
- [ ] Add the route at exactly `/settings/interviewer-application` beneath the authenticated route tree in `apps/frontend/src/routes/` (mirroring the existing `_authenticated` pattern), so it is reachable only by authenticated users; unauthenticated access is inherited and routed to `/login`.
- [ ] Add navigation to the route from the settings/profile surface (e.g. a “Become a verified interviewer” / “Apply” entry linking to `/settings/interviewer-application`) so authenticated users can discover the application page. The client nav is UX only; the backend API remains the authority.

### 2. Application Data Layer
- [ ] Add the interviewer application hooks/transport using the Story 7.5 shared request and response schemas.
- [ ] Query `GET /api/companies` through TanStack Query and include only selected record IDs plus contact email in `POST /api/interviewer/apply`; never reconstruct or submit trusted company/role/date snapshot fields.
- [ ] Keep employment profile data and interviewer application/status data under separate query keys because profile records are mutable while submitted snapshots are immutable.
- [ ] Use a status-first data flow: on route load, query `GET /api/interviewer/status` and render the appropriate state (no application, pending, approved, rejected) before enabling the selection form, so returning users are not shown a stale submit form.
- [ ] Prefill the contact email field from the authenticated account email but keep it editable; the submitted value is stored immutably by Story 7.5 and may differ from the account email.
- [ ] After successful submission, update or invalidate the interviewer status query from the returned application and render its `employmentHistory` snapshot rather than rebuilding it from the profile cache.

### 3. Employment Selection Experience
- [ ] In the interviewer application smart component, allow selection only for employment records where `isComplete === true`.
- [ ] Preserve the profile list order when building `employmentRecordIds`, and require between 1 and 10 unique selections before submission.
- [ ] Render incomplete records as unavailable with a clear “Needs details” label and a link to the employment-history settings editor delivered by Story 7.3.
- [ ] Provide an empty-history state linking to settings, and explain that selected details are copied into the application for review and will not change when the profile is edited later.

### 4. Submission and Status States
- [ ] Prevent duplicate submission while the mutation is pending and preserve selected IDs/contact email after a retryable failure.
- [ ] Show field/selection validation errors, application submission errors, and a retry path without losing the user's selections.
- [ ] On `409`, invalidate/refetch interviewer status and transition to the canonical pending/approved state if another request already created an application.
- [ ] After success, display the immutable snapshot with company, role, start/end range, and “Present” for a null end date.
- [ ] Do not render per-employment verified badges. The application status is the verification state and approval grants account-level eligibility.

### 5. Smart/Dumb Separation and Accessibility
- [ ] Keep data fetching, selection state, mutation, cache updates, and conflict handling in a smart component; keep application form/status rendering in separate dumb component files.
- [ ] Use accessible checkbox/radio semantics for employment selection, associate validation messages with controls, and move focus to the first actionable error after a failed submit.
- [ ] Ensure loading and disabled states do not remove selected-record context from assistive technology.

### 6. Tests and Documentation
- [ ] Add hook/transport tests proving the request contains only `email` and ordered `employmentRecordIds`.
- [ ] Add route and navigation tests: authenticated placement at `/settings/interviewer-application`, unauthenticated inherited to login, and the navigation entry from settings.
- [ ] Add tests for the status-first states: no application shows the selection form; pending shows the submitted snapshot/status and disables resubmission; approved shows the snapshot and disables resubmission; rejected shows a reapplication state that re-enables a new submission.
- [ ] Add smart-component tests for complete/incomplete/empty records, 1–10 selection validation, editable prefilled contact email, settings navigation, success cache refresh, `409` convergence, and retryable failures.
- [ ] Add dumb-component tests for snapshot rendering, null-end “Present” output, application status, accessibility labels, and absence of per-record verification badges.
- [ ] Include loading and error states and keyboard/focus behavior (focus moved to the first actionable error on failed submit, loading/disabled states preserving selected-record context for assistive technology).
- [ ] Update `docs/system/system-design/frontend-pages.md` with the `/settings/interviewer-application` route, employment selection, and immutable post-submission snapshot behavior.

## Implementation Notes
- **Prerequisites**: Stories 7.1–7.5. This story owns the interviewer application page/components rather than depending on a separate page-foundation ticket.
- Profile updates after submission do not update the displayed application snapshot. A page showing both must source each section from its own query.
- Third-party verification, document uploads, work-email challenges, and automatic re-verification are out of scope.

## End Goal
Applicants select complete profile employment records, submit only their IDs, and then see the immutable server-built evidence under review. Incomplete users receive a direct remediation path, conflicts converge to canonical application status, and the UI does not imply per-company verification.
