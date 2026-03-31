# Story 3.2: Interview Create Mode/Tier Policy Matrix

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Lock and encode the create-path product rules for mode/tier behavior so supported and unsupported interview creation combinations are deterministic.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`

## What Needs to Be Done

### 1. Lock mode/tier product rules
- [ ] Implement against these rules for Story 3:
  - AI-led interviews are quota/credit-gated by account limits (`free_ai_interviews` / credits).
  - Premium is treated as configurable account limit-policy input, not as a separate scheduling flow.
  - `interviewer_id` is out of scope for direct create route behavior in this story.
  - Free-user scheduling paths are:
    - AI-led via `POST /api/interviews`
    - Standard peer-to-peer via availability matcher flow
  - Direct peer-to-peer creation through `POST /api/interviews` is not supported.

### 2. Define and document creation matrix
- [ ] Encode the valid creation matrix for `(mode, tier, interviewer_id, scheduled_at)` in shared schema + service validation.
- [ ] Ensure unsupported combinations fail predictably with explicit validation/business-rule errors.
- [ ] Include both accepted and rejected matrix examples in tests and docs.

### 3. Source-of-truth document alignment
- [ ] Confirm and align source-of-truth docs before implementation if drift exists:
  - `docs/system/system-design/api-routes.md`
  - `docs/system/system-design/matching-tiers.md`
  - `docs/system/system-design/frontend-pages.md`
- [ ] If contracts still imply unsupported direct peer-to-peer create behavior, update docs first.

### 4. Validation test coverage
- [ ] Add/update service validation tests for the full matrix:
  - supported combinations
  - unsupported combinations
  - premium policy configuration behavior (not hardcoded)

### 5. Drift-prevention checks (required)
- [ ] Confirm no discrepancy with matcher ownership and deterministic Standard session creation in:
  - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-3-transactional-match-and-interview-write.md`
  - `docs/system/system-design/db-schemas.md`
- [ ] Confirm no discrepancy with Milestone 2 scope in `docs/product/stories/milestones.md`.
- [ ] If any discrepancy is found, update story/docs before implementation.

## End Goal
The create-path mode/tier behavior is fully locked, documented, and testable, preventing direct peer-to-peer drift and preserving matcher ownership for Standard sessions.
