# Story 1.2: Candidate Query and Deterministic Pairing

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define and implement the candidate selection query and deterministic pairing rules for Standard availability matching.
**Status**: In-Review

## What Needs to Be Done

### 1. Candidate selection query
- [x] Build a candidate query over `availability_slots` + `availability_requests` that only includes:
  - slot `status = 'available'`
  - request `status = 'active'`
  - request `current_matches < max_matches`
  - slot `start_time > NOW()`

### 2. Pairing eligibility rules
- [x] Pair candidates only when all of the following are true:
  - different users (`request_a.user_id != request_b.user_id`)
  - same interview type (`request_a.interview_type = request_b.interview_type`)
  - time windows overlap (`slot_a.start_time < slot_b.end_time` AND `slot_a.end_time > slot_b.start_time`)
- [x] Ensure matching logic remains compatible with the 60-minute slot model documented in `docs/system/system-design/matching-tiers.md` and `docs/system/system-design/db-schemas.md`.

### 3. Deterministic fairness ordering
- [x] Apply deterministic fairness ordering: oldest requests first.
- [x] Use a stable tie-breaker order (`request.created_at`, then stable IDs) so reruns are predictable.
- [x] Ensure the same input state always yields the same pair-attempt order.


## End Goal
The matcher candidate set and pair-attempt order are deterministic, fair, and aligned with documented eligibility and slot constraints.
