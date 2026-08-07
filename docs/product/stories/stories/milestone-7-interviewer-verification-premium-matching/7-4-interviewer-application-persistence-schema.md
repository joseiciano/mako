# Story 7.4: Interviewer Application Persistence Schema

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Add the versioned Postgres persistence foundation for immutable interviewer applications, including lifecycle constraints, query indexes, and backend database-row validation. Application submission, status routes, admin decisions, and UI are delivered by later stories.
**Status**: Todo

## What Needs to Be Done

### 1. Create the Interviewer Application Migration
- [ ] Create a versioned raw SQL migration in `packages/shared-backend/migrations/*.sql` using `pnpm db:migration:create -- interviewer_application_persistence` and the workflow in `docs/system/system-design/db-schemas.md`.
- [ ] Create the physical `user_interviewer_applications` table after the Better Auth migration has established the canonical `"user"` table. Add `id UUID PRIMARY KEY`, `user_id UUID NOT NULL REFERENCES "user"(id)`, `email TEXT NOT NULL`, `employment_history JSONB NOT NULL`, `status TEXT NOT NULL`, `reviewed_by UUID REFERENCES "user"(id)`, `created_at TIMESTAMPTZ NOT NULL`, and `updated_at TIMESTAMPTZ NOT NULL`.
- [ ] Add a status CHECK constraint allowing exactly `pending`, `approved`, and `rejected`.
- [ ] Add a CHECK constraint requiring `jsonb_typeof(employment_history) = 'array'`. Keep field-level snapshot validation in backend Zod schemas rather than duplicating the complete JSON contract in SQL.
- [ ] Do not add database defaults for IDs, status, or timestamps. Writers must generate the UUID with `crypto.randomUUID()` and supply `status`, `created_at`, and `updated_at` from trusted application code.
- [ ] Do not add `reviewed_at` in this migration. Story 7.8 owns the follow-up migration that adds the nullable decision timestamp.
- [ ] Keep application rows as audit history: do not add `ON DELETE CASCADE` to applicant or reviewer foreign keys, and do not add a foreign key from snapshot `sourceCompanyId` values to `user_companies`.

### 2. Enforce Lifecycle and Query Invariants
- [ ] Add `idx_user_interviewer_applications_active_user` as one partial unique index on `user_id WHERE status IN ('pending', 'approved')`. This must prevent any combination of two active-state rows for one user, including one pending plus one approved row, while allowing any number of rejected rows so a rejected user can reapply with a new application.
- [ ] Add `idx_user_interviewer_applications_user_latest` on `(user_id, created_at DESC, id DESC)` for the authenticated status lookup, which returns the user's latest application deterministically.
- [ ] Add `idx_user_interviewer_applications_status_created` on `(status, created_at ASC, id ASC)` for the admin review list's status filter and stable oldest-first ordering.
- [ ] Keep `reviewed_by` nullable while an application is pending. Admin decision behavior and reviewer attribution are owned by Story 7.8.
- [ ] Treat `employment_history` and the submitted contact `email` as immutable application evidence; later profile or account-email changes must not rewrite either stored value.

### 3. Add Backend Database-Row Validation
- [ ] Extend `packages/shared-backend/src/database/foundation-schemas.ts` with an `interviewerApplicationStatusSchema`, persisted employment snapshot schema, `interviewerApplicationRowSchema`, inferred types, and a parse function; export them through `packages/shared-backend/src/index.ts`. Reuse the canonical employment snapshot field semantics from Story 7.1 so the persisted entries, new-write `EmploymentHistorySnapshot`, and legacy-compatible read snapshot stay in one contract family.
- [ ] Define persisted snapshot entries as `{ sourceCompanyId: UUID | null, company: string, role: string, start: YYYY-MM-DD, end: YYYY-MM-DD | null }`. Require non-blank company/role values, strict date-only strings, and `end >= start` (compared as UTC calendar dates) when an end exists. The persisted/read model permits `sourceCompanyId: null` only for pre-contract imports or fixtures; no public application path may write null, and Story 7.5 must require non-null source IDs for every new submission.
- [ ] Validate `employment_history` as an array of snapshot entries and validate the stored contact email, status, nullable `reviewed_by`, and timestamps using the same snake_case field names returned by Postgres.
- [ ] Keep this ticket limited to backend database-row validation. Shared HTTP request/response contracts belong to Stories 7.1 and 7.5, while admin response contracts belong to Story 7.8.

### 4. Test and Document the Persistence Boundary
- [ ] Add schema-readiness tests proving the migration defines the complete table, foreign keys, status and JSON-array checks, active-state unique index, latest-status index, and admin-list index without database-generated ID/timestamp defaults.
- [ ] Add database-row schema tests for pending, approved, and rejected rows; current and past employment entries; pre-contract `sourceCompanyId: null`; blank company/role values; malformed or reversed dates; invalid statuses; non-array history; and invalid contact email/reviewer values.
- [ ] Verify the migration applies after `20260425120000_add_better_auth_schema.sql` by starting the local test Postgres described in `docs/system/local-testing.md` and running `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/mako_test pnpm --filter @mako/shared-backend db:test:reset`.
- [ ] Against that isolated test database, verify that a second pending or approved row conflicts when the user already has either active state, while multiple rejected rows are accepted.
- [ ] Update the `User_Interviewer_Applications` section of `docs/system/system-design/db-schemas.md` if implementation details change, preserving the lifecycle, immutable snapshot, and query-index contracts defined by this story.

## Implementation Notes
- **Prerequisite**: the migration system and Better Auth schema migration from Milestone 1 must already be applied.
- This story must complete before Story 7.8 adds `reviewed_at` and implements admin decisions, and before Story 7.5 implements transactional application submission and status retrieval.
- The application contact email is user-supplied and may differ from the authenticated account email. Story 7.5 validates it before insertion; admin detail uses this stored submission value.
- `user_companies` is mutable canonical profile data. `employment_history` is immutable submission-time evidence and is never synchronized from profile rows.
- `GET /api/interviewer/status` later returns the latest application by `created_at DESC, id DESC`; rejected history remains stored even after a newer reapplication.
- Legacy-null parsing is a read-compatibility boundary for controlled pre-contract imports/fixtures only. It does not create an API or repository write path for null `sourceCompanyId` values.
- This ticket does not implement `POST /api/interviewer/apply`, `GET /api/interviewer/status`, employment-record selection, application UI, admin review behavior, notifications, document uploads, work-email checks, external verification, or Premium scheduling.
- No new Worker binding, secret, queue, or external service is required.

## End Goal
Postgres can safely retain immutable interviewer-application evidence and review attribution, reject every duplicate pending/approved lifecycle combination at the database boundary, preserve rejected reapplication history, and support deterministic applicant-status and admin-list queries. Later API, UI, and admin-review stories have a typed and concurrency-safe persistence boundary without introducing temporary free-form application behavior.
