# Story 7.5: Interviewer Application Employment Snapshot API Integration

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Implement the interviewer application backend to accept canonical employment record IDs, validate ownership, and persist an immutable normalized snapshot for manual admin verification.
**Status**: Todo

## What Needs to Be Done

### 1. Application Request and Response Contracts
- [ ] Add shared Zod schemas and inferred types under `packages/shared/src/` for `InterviewerApplicationStatus`, `InterviewerApplication`, `InterviewerApplicationRequest`, `InterviewerApplicationResponse`, and `InterviewerApplicationStatusResponse`; export them through `packages/shared/src/index.ts` for backend and frontend consumers.
- [ ] Implement `POST /api/interviewer/apply` with `{ email, employmentRecordIds }`, where `email` is a valid user-supplied contact email that may differ from the authenticated account email and `employmentRecordIds` is a unique array of 1–10 UUIDs. Do not introduce a temporary free-form `employment_history` request contract.
- [ ] The client must never submit trusted company/role/date snapshot fields. The server builds `employmentHistory: EmploymentHistorySnapshot[]` from current database records.
- [ ] Include each selected source row's ID as `sourceCompanyId` in the snapshot along with normalized `company`, `role`, `start`, and nullable `end`.
- [ ] Define `InterviewerApplication` exactly as `{ applicationId, email, employmentHistory, status, createdAt, updatedAt }`: `applicationId` is a UUID; `email` is the stored contact email; `employmentHistory` uses the **legacy-compatible read/response schema** `{ sourceCompanyId: UUID | null, company: string, role: string, start: YYYY-MM-DD, end: YYYY-MM-DD | null }[]` where `sourceCompanyId: null` is accepted **only** for controlled pre-contract/legacy data; `status` is exactly `pending | approved | rejected`; and timestamps are ISO-8601 strings. Do not expose `reviewedBy` through applicant routes.
- [ ] The read/response schema is explicitly separate from the **non-null write schema** used to build new snapshots: this route's snapshot creation must use a write schema that requires every entry's `sourceCompanyId` to be a non-null selected `user_companies.id`, so no new submission can ever persist a null source ID (null remains read-compatible only for pre-contract data).
- [ ] Define `InterviewerApplicationResponse` exactly as `{ application: InterviewerApplication }` and `InterviewerApplicationStatusResponse` exactly as `{ application: InterviewerApplication | null }`.
- [ ] Return snapshots from `POST /api/interviewer/apply`, `GET /api/interviewer/status`, and admin application detail responses. Summary/list responses continue omitting employment history.
- [ ] Persist the validated contact email as immutable submission data; later account-email changes must not rewrite it.

### 2. Transactional Submission Logic
- [ ] In the application submission transaction, validate the authenticated account is active and eligible to apply under the interviewer-application rules: no existing pending application and no approved application; rejected users may create a new row. An authenticated but inactive/deleted account returns `403` (fail closed, consistent with other applicant routes).
- [ ] Enforce the transaction lock order to avoid deadlocks and races: first acquire a row lock on the applicant `"user"` row, then `SELECT ... FOR UPDATE` the selected `user_companies` rows sorted by `id` ascending (UUID order) so concurrent submissions lock rows in the same deterministic order.
- [ ] After locking, revalidate that the applicant user row is still active and that every selected `user_companies` row still resolves to an active (`deleted_at IS NULL`), complete record owned by the authenticated user. Any missing, foreign, deleted, duplicate, incomplete, or concurrently-removed selection returns `400` without revealing ownership details.
- [ ] Build the normalized `EmploymentHistorySnapshot` entries from the locked, revalidated rows, then insert the application with its complete `employment_history` JSONB snapshot atomically. A failure in validation or persistence writes neither a partial application nor partial history.
- [ ] Use the single pending-or-approved partial unique index defined by Story 7.4 so concurrent submissions and approval/submission races cannot leave both states for one user. Map an active-state uniqueness conflict to `409`.
- [ ] Implement `GET /api/interviewer/status` to return the authenticated user's latest application by deterministic `created_at DESC, id DESC` ordering, or `null` when no application exists.

### 3. Backend Module and Route Behavior
- [ ] Add an interviewer-application module under `packages/shared-backend/src/` following the controller-service-repository pattern and export it through the package barrel. The repository owns raw SQL/transactions, the service owns eligibility and snapshot rules, and the controller owns HTTP parsing and response mapping.
- [ ] Register both authenticated routes in `apps/backend-rest/src/index.ts` using the existing auth middleware and Hyperdrive-backed connection wiring; deleted/inactive or unauthenticated accounts must not submit applications.
- [ ] `POST /api/interviewer/apply` returns `201` with `InterviewerApplicationResponse`; malformed JSON, invalid fields, or invalid employment selections return `400`; unauthenticated requests return `401`; inactive/deleted accounts return `403`; and pending/approved or concurrent active-state conflicts return `409`.
- [ ] `GET /api/interviewer/status` returns `200` with `InterviewerApplicationStatusResponse`; unauthenticated requests return `401`; inactive/deleted accounts return `403`.
- [ ] Set `Cache-Control: private, no-store` on both applicant route responses, including error responses produced by the module.

### 4. Immutable Snapshot and Eligibility Rules
- [ ] Treat `employment_history` as immutable after insertion; provide no application endpoint that edits it in place.
- [ ] Later edits or soft deletion of source `user_companies` rows do not update the JSON snapshot, do not change a pending/decided application, and do not mutate `"user".companies`.
- [ ] Approval continues to set `"user".companies = true` in the admin decision transaction from Story 7.8. Rejection leaves eligibility unchanged.
- [ ] Post-approval employment edits do not automatically revoke eligibility. Revocation remains a manual operational/admin concern outside this MVP ticket.
- [ ] Do not add per-company verification status, verification evidence, work-email challenges, documents, or an external verification provider.

### 5. Audit-Safe Observability
- [ ] Emit structured application-submission events for requested, succeeded, conflicted, and failed outcomes with application/user IDs and selected-record count where available.
- [ ] Do not log contact email, company names, roles, dates, or the employment snapshot.

### 6. Tests and Documentation
- [ ] Test successful ordered snapshot creation and rejection of empty, over-limit, duplicate, foreign, deleted, incomplete, and unknown record IDs.
- [ ] Test exact shared contract parsing and response mapping, contact emails that differ from account email, latest-status ordering across rejected reapplication history, null status when no row exists, and all documented HTTP/cache outcomes.
- [ ] Test the exact inactive status behavior: unauthenticated returns `401`, while an authenticated inactive/deleted account returns `403` on both routes, with no partial data and no status-leaking distinction.
- [ ] Test the lock order: apply-vs-update, apply-vs-soft-delete, and apply-vs-account-delete races, plus concurrent submission tests, proving the applicant-user-lock-first then UUID-ordered `user_companies` lock sequence prevents deadlocks and that revalidation catches concurrent removal or deactivation (returning `400` for selections and `403` for an inactive account).
- [ ] Test transaction rollback, concurrent submissions, rejected-user reapplication with a new snapshot, and approved/pending reapplication conflicts.
- [ ] Test snapshot immutability after source update/delete and verify post-approval profile edits leave `"user".companies = true`.
- [ ] Update `docs/system/system-design/api-routes.md`, `docs/system/system-design/db-schemas.md`, and `docs/system/system-design/concurrency-data-integrity.md` with the final request, snapshot, and transaction contracts.

## Implementation Notes
- **Prerequisites**: Stories 7.1–7.3 and Story 7.4's interviewer-application persistence foundation. This story owns the applicant submission/status API; Story 7.8 remains the owner of manual approval/rejection and account eligibility mutation.
- `sourceCompanyId` is audit context inside the immutable snapshot, not a live foreign-key dependency. This intentionally allows the snapshot to survive profile soft deletion and account-retention workflows.
- Existing applications created before this integration retain their stored snapshots and remain reviewable; no backfill should fabricate source IDs.
- The persisted/admin read model accepts legacy `sourceCompanyId: null`, but every snapshot built by this route must use a non-null selected `user_companies.id`.
- Manual admin review is the complete MVP employment-verification mechanism.

## End Goal
Every new interviewer application API request derives employment evidence from complete records owned by the applicant, stores an immutable server-built snapshot, and remains stable when the profile changes. Admin approval continues to be the single account-level verification decision, with no duplicate per-record verification lifecycle or external provider dependency.
