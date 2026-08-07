# Story 7.1: Employment History Schema & Shared Contracts

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Extend the existing `user_companies` model into the canonical employment-history source used by interviewer applications, while preserving existing records and keeping verification at the application/account level rather than on individual employment rows.
**Status**: done

## What Needs to Be Done

### 1. Versioned SQL Migration
- [ ] Create a versioned raw SQL migration in `packages/shared-backend/migrations/*.sql` using the workflow in `docs/system/system-design/db-schemas.md`.
- [ ] Add nullable `role TEXT` and nullable `ended_at TIMESTAMPTZ` columns to `user_companies`. Existing `joined TIMESTAMPTZ` remains the persisted employment start value to avoid a destructive rewrite; API contracts expose both persisted timestamps as date-only `start`/`end` fields.
- [ ] Add constraints requiring a non-null role to remain non-blank after trimming and requiring `ended_at >= joined` when an end value exists. Compare `ended_at` and `joined` as UTC calendar dates using the exact SQL UTC-date comparison `(ended_at AT TIME ZONE 'UTC')::date >= (joined AT TIME ZONE 'UTC')::date`: extract both timestamps in UTC, compare their date-only `YYYY-MM-DD` values, never their local-time components, so a valid same-day start/end or an end on the UTC date equal to the join date is accepted regardless of the timezone the app/user is in.
- [ ] Do not add defaults for IDs or timestamps. Continue generating UUIDs and setting `created_at`/`updated_at` in application code according to `packages/shared-backend/migrations/AGENTS.md`.
- [ ] Preserve existing rows without inventing roles. A migrated row with `role IS NULL` is valid but incomplete and cannot be selected for a new interviewer application until the user updates it.
- [ ] Keep the existing lowercase company constraint, soft-deletion behavior, user foreign key, and `idx_user_companies_user_id` index.

### 2. Canonical Shared Contracts
- [ ] Add shared Zod schemas and inferred types under `packages/shared/src/` and export them through `packages/shared/src/index.ts` so backend and frontend code use one contract.
- [ ] Define `EmploymentRecord` exactly as `{ id, userId, company, role, start, end, isComplete, createdAt, updatedAt }`, where IDs are UUID strings, `role` is `string | null`, `start` is a `YYYY-MM-DD` string, `end` is a `YYYY-MM-DD | null`, `isComplete` is boolean, and timestamps are ISO-8601 strings. This is the canonical read/write record contract for employment history and owns the canonical shared employment contracts.
- [ ] Define the canonical create/update input schemas using `{ company, role, start, end }`. Trim text, normalize `company` to lowercase, require non-empty `company` and `role`, validate date-only strings strictly, and reject `end < start`. These canonical inputs use only `start`/`end`; they must never accept the legacy `joined` field.
- [ ] Define a distinct temporary `EmploymentRecordCompatibilityResponse` shape (alias) used only by the Story 7.2 employment-history API during Milestone 7. It is `EmploymentRecord` extended with a deprecated `joined` ISO-8601 alias for backward compatibility. Keep it separate from `EmploymentRecord` so new consumers can type against the canonical record without seeing the deprecated field. Note in the schema that this compatibility shape is temporary and must be removed only via an approved breaking-change ticket.
- [ ] Define `EmploymentHistorySnapshot` for new submissions as `{ sourceCompanyId, company, role, start, end }`, where `sourceCompanyId` is a non-null UUID, `role` is required, and `end` remains nullable for a current role. This is the new-write contract and must always require a non-null `sourceCompanyId`.
- [ ] Define a separate legacy-compatible application response/read snapshot schema (persisted/admin read model) as `{ sourceCompanyId: UUID | null, company, role, start, end }`. Only this read/response snapshot may accept `sourceCompanyId: null` for pre-contract imports or legacy application rows; the new-write `EmploymentHistorySnapshot` never accepts null.
- [ ] Keep database row schemas in `packages/shared-backend/src/` and map snake_case database fields to camelCase API contracts explicitly. Use distinct snake_case row schemas (e.g. `userCompaniesRowSchema` exposing `id`, `user_id`, `company`, `role`, `joined`, `ended_at`, `created_at`, `updated_at`, `deleted_at`) that mirror the Postgres row shape and are parsed before any camelCase mapping. Derive `isComplete` server-side as `role !== null`; never trust a client-provided completeness flag.

### 3. Migration and Contract Tests
- [ ] Test migration from the current schema with both existing active and soft-deleted company rows; verify all rows are retained, new fields are nullable, and invalid role/date constraints are rejected.
- [ ] Test shared validation for text normalization, strict date-only parsing, current employment (`end: null`), end-before-start rejection, and legacy incomplete record parsing.
- [ ] Test mapping `joined` to date-only `start` without timezone-dependent date drift.
- [ ] Test the `ended_at >= joined` constraint and the validation logic against the exact UTC calendar-date comparison `(ended_at AT TIME ZONE 'UTC')::date >= (joined AT TIME ZONE 'UTC')::date`: verify a same-day start/end, an end on the same UTC date as join, and cross-timezone inputs all evaluate against the UTC `YYYY-MM-DD` dates, with timezone-specific tests confirming no local-timezone drift changes the outcome.

### 4. System Documentation
- [ ] Update `docs/system/system-design/db-schemas.md` with the new `user_companies` columns, constraints, legacy completeness behavior, and the explicit rule that employment-row edits do not grant or revoke interviewer eligibility.
- [ ] Update `docs/system/system-design/api-routes.md` with the canonical employment record and snapshot field names consumed by Stories 7.2–7.3 and 7.5–7.6.

## Implementation Notes
- Employment verification is manual application review for the MVP. Do not add third-party verification, document uploads, work-email challenges, or per-employment verification status fields.
- The server-owned `"user".companies` boolean remains the account-level verified-interviewer eligibility flag. Application decision metadata (`status`, `reviewed_by`, and `reviewed_at`) is the verification audit record.
- Existing rows remain visible after migration. Their missing role is shown as incomplete and must be corrected through Story 7.2 before application selection.
- `EmploymentHistorySnapshot` is immutable application evidence. It is separate from the mutable `EmploymentRecord` response even though both share normalized field semantics.
- Do not weaken the new-submission contract to support legacy rows: new snapshots require `sourceCompanyId`, while persistence and admin-read schemas own the legacy-null compatibility boundary.

## End Goal
The database and shared packages provide a backwards-safe canonical employment-history model with company, role, start, and optional end date. Existing records survive without fabricated data, incomplete records are identifiable, and downstream application code has a single typed snapshot contract without introducing duplicate per-company verification state.
