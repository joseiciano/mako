# Story 7.8: Admin Review API

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Implement the protected admin review API to list, view, and atomically decide pending interviewer applications, using offset pagination, guarded decision transactions, and shared Zod contracts. Approval grants verified-interviewer eligibility via `"user".companies = true`; rejection preserves history and stays allowed for deleted applicants.
**Status**: Todo

## What Needs to Be Done

### 1. Shared Contracts in `@mako/shared`
- [ ] Define Zod schemas and inferred types in `packages/shared/src/` for: `AdminApplicationStatus` (exactly `'pending' | 'approved' | 'rejected'`), `AdminDecision` (exactly `'approved' | 'rejected'`), `AdminApplicationSummary`, `AdminApplicationDetail`, `AdminListQuery`, `AdminListResponse`, `AdminDetailResponse`, and `AdminDecisionBody`.
- [ ] `AdminApplicationSummary` must contain: `applicationId`, `applicant { userId, name, email, isAccountDeleted }`, `status`, `createdAt`, `reviewedAt`. It must **not** include `employmentHistory` or `reviewedBy`.
- [ ] `AdminApplicationDetail` must contain: `applicationId`, `applicant { userId, name, email, isAccountDeleted }`, `employmentHistory` (reusing the shared legacy-compatible application snapshot schema defined by Story 7.1: the immutable `{ sourceCompanyId: UUID | null, company, role, start, end: string | null }[]` contract), `status`, `reviewedBy` (`{ userId, name, email } | null`), `createdAt`, `reviewedAt`. `sourceCompanyId` is nullable only for legacy applications created before Story 7.5. Reuse the Story 7.1 shared schema; do not redefine a competing employment snapshot contract.
- [ ] `AdminListQuery` = `{ status?: 'pending' | 'approved' | 'rejected', limit?: number, offset?: number }`; `AdminListResponse` = `{ applications: AdminApplicationSummary[], pagination: { limit, offset, hasMore } }`.
- [ ] `AdminDecisionBody` = `{ decision: 'approved' | 'rejected' }`; the PATCH response uses the same `AdminDetailResponse` (`{ application: AdminApplicationDetail }`) wrapper.
- [ ] Export all schemas/types through `packages/shared/src/index.ts` for both frontend and backend consumers.
- [ ] Exact scalar/nullability contracts: all IDs (`applicationId`, `userId`) are UUID strings; `name` and `email` are strings; all timestamps (`createdAt`, `reviewedAt`) are ISO-8601 strings; `reviewedAt: string | null`; `isAccountDeleted: boolean`; `employmentHistory.company` and `.role` are strings, `.start` is a `YYYY-MM-DD` string, `.end` is `YYYY-MM-DD | null`, and `.sourceCompanyId` is `UUID | null` for legacy compatibility.

### 2. Schema & Migration
- [ ] Create a versioned SQL migration in `packages/shared-backend/migrations/*.sql` (after the prerequisite application table exists) that adds a nullable `reviewed_at TIMESTAMPTZ` column to `user_interviewer_applications`. This ticket owns this migration.
- [ ] Add a test asserting the migration applies cleanly and `reviewed_at` is nullable and defaults to `NULL` on a pending application.
- [ ] Extend Story 7.4's `interviewerApplicationRowSchema`, inferred row type, parser tests, and exports for nullable `reviewed_at`; cover both pending null values and populated approved/rejected decision timestamps before mapping admin responses.
- [ ] Update the `User_Interviewer_Applications` section of `docs/system/system-design/db-schemas.md` to document the nullable `reviewed_at` decision timestamp, owned by this ticket.

### 3. Repository Layer (Raw SQL via Hyperdrive)
- [ ] Implement a repository following the controller-service-repository pattern (`docs/coding/backend-instructions.md`) using raw Postgres SQL via Hyperdrive; no ORM is used.
- [ ] List query: filter by `status` (default `pending`), order oldest-first with stable `ORDER BY created_at ASC, id ASC`, and use `limit + 1` (or equivalent) to compute `hasMore`; return summaries **without** `employmentHistory` or reviewer data.
- [ ] Detail query: return the full application including `employment_history`, applicant identity, and reviewer identity. Applicant identity uses current `"user".name`, the application row's stored `email` as the contact snapshot, and an `isAccountDeleted` boolean derived from the applicant's `"user"` row; reviewer identity is `{ userId, name, email } | null` from current reviewer account data.
- [ ] Decision query: guarded `UPDATE` on the application row with `AND status = 'pending'`, setting `status`, `reviewed_by`, `reviewed_at`, and `updated_at`. On `approved`, in the same transaction check the applicant's `"user"` row is active and update it to set `companies = true`, validating the affected row; if the applicant is inactive/deleted, roll back the application transition and return `409`. On `rejected`, do not mutate the applicant user row (including a deleted user); rejection remains allowed.
- [ ] Follow-up reads: use a zero-row result after the guarded update to distinguish `404` (application unknown) from `409` (application exists but not `pending` / concurrent / approval of deleted applicant).

### 4. Service Layer
- [ ] Implement a service that validates admin input via the shared Zod schemas, calls the repository, and maps row data to the shared contract shapes (camelCase).
- [ ] Enforce business rules: self-review (`application.applicant.userId === actingAdmin.id`) returns `403`; deleted-applicant approval returns `409` with no mutation while rejection remains allowed (so the queue can be cleared); already-eligible is handled deterministically: if a pending active applicant already has `companies = true`, approval still succeeds, records the decision/reviewer/timestamps, and the idempotent `SET companies = true` remains true.
- [ ] Handle the `PATCH` in a single transaction; on `approved`, atomic eligibility update with rollback on failure. Set `reviewer`, `reviewed_at`, and `updated_at` together with the decision.
- [ ] Retry retryable transaction conflicts (`40001`, `40P01`) with **three** total attempts; on exhaustion produce a deterministic error/log. First concurrent decision wins; the other concurrent writer receives `409`.
- [ ] Structured audit logs for decision lifecycle: `requested`, `succeeded`, `conflicted`, `failed`, and transaction retries, each including application ID and admin ID and the decision, but **no** employment history and **no** email.

### 5. Controller & Route Registration
- [ ] Implement controller functions (list, detail, decide) wired to the service, validating query params and bodies against the shared Zod schemas.
- [ ] Register the routes in `apps/backend-rest/src/index.ts` under the protected admin surface, each guarded by `require-admin.ts` from `packages/shared-backend/src/auth/require-admin.ts`.
- [ ] Set the exact header `Cache-Control: private, no-store` on all admin route responses (list, detail, decision), including error responses produced by the module.
- [ ] Classify failures fail-closed in the common auth/error middleware: auth/session unavailability (session store or Better Auth session provider unreachable) and DB connectivity/unavailability return `503` with no demo authorization fallback; programming/query errors (a coding bug or a well-formed query that fails on valid data) remain `500`. Preserve unauthenticated requests against a valid runtime as `401`.

### 6. Contracts (Exact, Not Examples)
- [ ] `GET /api/admin/applications` — protected; query `status` default `pending` (exactly `pending|approved|rejected`), `limit` an integer in `1..100` (default `25`), `offset` a non-negative integer (default `0`); invalid query → `400` (including `limit` outside `1..100`, negative or non-integer `offset`, malformed `status`, or non-numeric pagination params); response `{ applications: AdminApplicationSummary[], pagination: { limit, offset, hasMore } }`; stable oldest-first `(created_at ASC, id ASC)`. No `employmentHistory` or reviewer in summaries.
- [ ] `GET /api/admin/applications/:id` — protected; unknown id → `404`; response `{ application: AdminApplicationDetail }`.
- [ ] `PATCH /api/admin/applications/:id` — protected; body `{ decision: 'approved' | 'rejected' }`; invalid JSON/body/id → `400`; unauthenticated → `401`; non-admin or self-review → `403`; unknown application → `404`; non-pending, concurrent, or approval-of-deleted → `409`; response `{ application: AdminApplicationDetail }`.

### 7. API Docs
- [ ] Update `docs/system/system-design/api-routes.md` with the three admin routes and their exact request/response contracts (list/detail/decision) and caching/ordering/status semantics.
- [ ] Do **not** add or claim runtime OpenAPI/Swagger annotations; generated OpenAPI/Swagger tooling is deferred to a separate repository-wide initiative. Shared validated Zod schemas, exact API documentation, and contract tests are mandatory in this ticket; no partial annotation convention is introduced here.
- [ ] Update `docs/system/system-design/db-schemas.md` for `"user".companies = true` as the verified-interviewer eligibility flag (distinct from the `user_companies` history table). The nullable `reviewed_at` decision timestamp is documented by this ticket's schema/migration step.
- [ ] Update `docs/system/system-design/concurrency-data-integrity.md` with the guarded single-decision transaction, first-concurrent-wins semantics, deleted-applicant rules, and retry (`40001`/`40P01`, three attempts) diagnostics.
- [ ] Update `docs/product/stories/milestones.md` (Admin Review area) as relevant.

### 8. Tests
- [ ] Backend tests for all authorization outcomes (401/403/pass) and input validation (invalid status/limit/offset/body/id → `400`).
- [ ] Tests for list filtering, stable `(created_at ASC, id ASC)` ordering, offset bounds, limit bounds (`25` default, `100` max), and `hasMore` behavior.
- [ ] Tests for detail retrieval (with `employmentHistory` and `reviewedBy`) and unknown-id `404`.
- [ ] Tests for decision: approve/reject happy paths, self-review `403`, unknown `404`, non-pending `409`, duplicate and opposite concurrent decisions (first wins, other `409`), rollback when the eligibility update fails, deleted-applicant approve `409` / reject allowed, already-eligible handling, retries/exhaustion, and logs that avoid PII (no employment history or email).
- [ ] Add real-Postgres concurrency coverage (against the isolated test database in `docs/system/local-testing.md`): two concurrent decision writers converge to one winner, the loser receives `409`, and no duplicate or split state persists. Add a decision-attribution invariant test asserting `reviewedBy` always equals the acting admin's identity for every persisted decision (approved and rejected) and is never the applicant themself.

## Implementation Notes
- **Prerequisites**: **Story 7.1** (the shared legacy-compatible employment snapshot schema reused in `AdminApplicationDetail`), **Story 7.4** (must create `user_interviewer_applications` with one partial unique index covering pending-or-approved rows, so no two active-state rows can coexist; a rejected user may reapply by creating a **new** row preserving history, while an approved user may not reapply), and **Story 7.7** (admin identity/authorization, `require-admin.ts`, and the protected admin surface). The nullable `reviewed_at` column is owned by this ticket's schema/migration step.
- Offset pagination is used, **not** cursor pagination.
- List responses intentionally omit `employmentHistory` (detail-only) and reviewer data; detail responses include them.
- No rejection reason or internal note field is added in MVP; they are explicitly excluded.
- `"user".companies = true` is the verified-interviewer eligibility flag for this milestone and is distinct from the `user_companies` history table.
- Employment history in application detail is an immutable submission-time snapshot. Later profile edits/deletions do not rewrite it or automatically revoke account eligibility.
- No notification to applicants on decision in this ticket; that is deferred until an email/notification contract exists.

## End Goal
An admin can list pending/approved/rejected interviewer applications with stable offset pagination, view a single application's full detail, and approve or reject it atomically. Approval transitions the application to `approved`, records reviewer/`reviewed_at`/`updated_at`, and flips the applicant's `"user".companies = true` in the same transaction with rollback on failure; rejection records reviewer attribution and leaves the applicant unchanged. Self-review and deleted-applicant approval return `403`/`409` respectively without mutation, concurrent decisions converge to one winner, and all routes fail closed with structured PII-safe audit logs.
