# Story 1.3: Transactional Match and Interview Write

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement transactional, lock-safe match execution and interview row creation for successful Standard pairs.
**Status**: Todo

## What Needs to Be Done

### 1. Transaction and locking behavior
- [ ] Execute each match attempt in a single Postgres transaction.
- [ ] Lock both slots and both parent requests via `SELECT ... FOR UPDATE` in a consistent key order to reduce deadlock risk.
- [ ] Re-check slot/request eligibility after locking (status + quota still valid) before writing.

### 2. Interview creation contract
- [ ] Create one `interviews` row per successful pair using schema in `docs/system/system-design/db-schemas.md`:
  - `type` from matched request `interview_type`
  - `mode = 'peer_to_peer'`
  - `tier = 'standard'`
  - `status = 'scheduled'`
  - `scheduled_at` from matched slot start time
  - `scheduler_id` / `interviewer_id` assigned using documented deterministic request ordering rule (`created_at`, then `id`) from `docs/system/system-design/db-schemas.md` and `docs/system/system-design/matching-tiers.md`
  - alias fields populated using the same alias policy used by Interview CRUD implementation

### 3. Post-write state updates
- [ ] Mark both matched slots as `status = 'matched'`.
- [ ] Increment `current_matches` for both requests.
- [ ] Keep all writes atomic so partial match state cannot persist.

### 4. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with previous stories: `docs/product/stories/stories/milestone-1-foundation-authentication/1-3-database-migration-system.md` and `docs/product/stories/milestones.md`.
- [ ] Confirm no discrepancy with `docs/system/system-design/db-schemas.md`, `docs/system/system-design/concurrency-data-integrity.md`, and `docs/system/system-design/api-routes.md`.
- [ ] If any discrepancy is found, update story details before implementation.

## End Goal
Every successful pair is committed atomically as a single scheduled Standard peer-to-peer interview with deterministic role assignment and consistent slot/request state transitions.
