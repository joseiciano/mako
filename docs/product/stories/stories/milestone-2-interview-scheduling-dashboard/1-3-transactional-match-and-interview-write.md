# Story 1.3: Transactional Match and Interview Write

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement transactional, lock-safe match execution and interview row creation for successful Standard pairs.
**Status**: In-Review

## What Needs to Be Done

### 1. Transaction and locking behavior
- [x] Execute each match attempt in a single Postgres transaction.
- [x] Lock both slots and both parent requests via `SELECT ... FOR UPDATE` in a consistent key order to reduce deadlock risk.
- [x] Re-check slot/request eligibility after locking (status + quota still valid) before writing.

### 2. Interview creation contract
- [x] Create one `interviews` row per successful pair using schema in `docs/system/system-design/db-schemas.md`:
  - `type` from matched request `interview_type`
  - `mode = 'peer_to_peer'`
  - `tier = 'standard'`
  - `status = 'scheduled'`
  - `scheduled_at` from matched slot start time
  - `scheduler_id` / `interviewer_id` assigned using documented deterministic request ordering rule (`created_at`, then `id`) from `docs/system/system-design/db-schemas.md` and `docs/system/system-design/matching-tiers.md`
  - alias fields populated using the same alias policy used by Interview CRUD implementation

### 3. Post-write state updates
- [x] Mark both matched slots as `status = 'matched'`.
- [x] Increment `current_matches` for both requests.
- [x] Keep all writes atomic so partial match state cannot persist.

## End Goal
Every successful pair is committed atomically as a single scheduled Standard peer-to-peer interview with deterministic role assignment and consistent slot/request state transitions.
