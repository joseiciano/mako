# Story 3.3: Interview DB Schema, Migrations, and Index Readiness

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Ensure interview CRUD behavior is backed by a schema-accurate, migration-safe, and index-aware Postgres foundation.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`

## What Needs to Be Done

### 1. Schema parity lock
- [x] Ensure the `interviews` schema used by Story 3 matches `docs/system/system-design/db-schemas.md` exactly:
  - columns
  - enum/check values
  - nullable vs required fields
  - timestamp fields and semantics

### 2. Migration readiness
- [x] If required DB shape is missing, add/adjust migrations in `packages/shared-backend/migrations/*.sql`.
- [x] Keep migration workflow aligned with `docs/system/system-design/db-schemas.md` migration instructions.

### 3. Index readiness for list/cancel workloads
- [x] Ensure listing and cancellation query paths are index-aware.
- [x] If new indexes are needed for deterministic list/cancel behavior, update `docs/system/system-design/db-schemas.md` first, then add migration SQL.

### 4. Repository-level verification
- [x] Add/update repository tests validating schema assumptions used by create/list/cancel.
- [x] Add/update repository query behavior tests for list filters, participant scoping, and cancellation update behavior.

## End Goal
Interview CRUD is backed by schema-accurate migrations and index-aware query foundations, with repository-level tests validating DB assumptions and behavior.
