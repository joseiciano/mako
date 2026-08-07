# Story 7.3: Employment History Profile UI

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Upgrade the existing professional-history settings UI to manage canonical company, role, start, and end fields and clearly identify legacy records that must be completed before an interviewer application.
**Status**: Todo

## What Needs to Be Done

### 1. Shared Types and Data Hooks
- [ ] Replace locally declared `Company` and request/response types in `apps/frontend/src/hooks/use-account.ts` with the Story 7.1 contracts from `@mako/shared`.
- [ ] Update `useCompanies` and `useAddCompany` for canonical `start`/`end` fields and add update/delete mutations for the Story 7.2 routes.
- [ ] Keep TanStack Query as the owner of server state. On successful create/update/delete, update or invalidate `accountCompaniesQueryKey` deterministically; roll back any optimistic cache update on failure.
- [ ] Use only the canonical `start`/`end` fields from `@mako/shared` for reading, writing, and rendering. Do not use the deprecated `joined` response alias in new frontend code.
- [ ] Format dates as date-only `YYYY-MM-DD` (and human-readable day/month/year where shown) derived from the canonical date-only `start`/`end` strings, formatting the value directly rather than parsing into a local-timezone `Date` and re-formatting, so there is no timezone-dependent date drift.

### 2. Professional History Rendering
- [ ] Update the existing smart/dumb components under `apps/frontend/src/components/profile/company-list/`; keep query/mutation/form state in the smart component and rendering-only behavior in dumb components in separate files.
- [ ] Display company, role, formatted start/end range, and “Present” when `end` is null.
- [ ] Display a clear “Needs details” state for migrated records where `isComplete === false`, with an edit action. Do not label individual records “verified” or “unverified,” because verification is account-level.
- [ ] Preserve loading, empty, error, retry, and mutation-failure states.

### 3. Add and Edit Form
- [ ] Replace the current company/joined-only form with fields for company, role, start date, end date, and a “Current role” control that produces `end: null`.
- [ ] Use the shared schema for client validation while retaining server validation as authoritative; show field-level errors for required values, invalid dates, and end-before-start.
- [ ] Use the same form component for create and edit to avoid divergent validation and accessibility behavior.
- [ ] Prevent duplicate submissions while a mutation is in flight and preserve entered values after a failed request.

### 4. Soft-Delete Experience
- [ ] Add a delete action with explicit confirmation naming the selected company record.
- [ ] Explain in confirmation copy that deleting the profile record does not alter previously submitted applications or automatically revoke interviewer eligibility.
- [ ] Remove the record from the visible list after successful soft deletion and show a recoverable error state if deletion fails.

### 5. Tests and Documentation
- [ ] Test complete and incomplete record rendering, current/past date ranges, add/edit validation, successful mutations, cache rollback/invalidation, delete confirmation, and all loading/empty/error states.
- [ ] Test smart data behavior separately from dumb rendering behavior.
- [ ] Include a test that rendered dates match the canonical date-only `start`/`end` strings exactly regardless of the machine/browser timezone (no drift).
- [ ] Include keyboard/focus behavior for dialogs and accessible names for edit/delete actions.
- [ ] Update `docs/system/system-design/frontend-pages.md` so `/settings` documents employment create/update/delete and the incomplete-record requirement for interviewer applications.

## Implementation Notes
- **Prerequisite**: Stories 7.1 and 7.2.
- The UI manages factual employment history only. Application status and account-level verification belong to interviewer onboarding/admin review surfaces.
- Editing history after approval does not revoke eligibility in the MVP. Do not add automatic re-verification prompts or per-row badges.

## End Goal
Users can manage complete employment history from settings, repair legacy records without losing them, represent current roles with no end date, and understand that profile edits are separate from immutable application evidence and account-level verification.
