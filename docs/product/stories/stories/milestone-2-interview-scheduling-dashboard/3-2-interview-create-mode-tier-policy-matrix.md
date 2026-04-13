# Story 3.2: Interview Create Mode/Account-Policy Matrix

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Lock and encode create-path product rules for mode and account-policy behavior so supported and unsupported interview creation combinations are deterministic.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`

## What Needs to Be Done

### 1. Lock mode/account-policy product rules
- [x] Implement against these rules for Story 3:
  - AI-led interviews are quota/credit-gated by account limits (`free_ai_interviews` / credits).
  - Client does not submit `tier`; effective tier/policy is resolved server-side from account state (for example free vs subscribed) and quota/credit rules.
  - `interviewer_id` is out of scope for direct create route behavior in this story.
  - Free-user scheduling paths are:
    - AI-led via `POST /api/interviews`
    - Standard peer-to-peer via availability matcher flow
  - Direct peer-to-peer creation through `POST /api/interviews` is not supported.

### 2. Define and document creation matrix
- [x] Encode the valid creation matrix for `(mode, account policy, interviewer_id, scheduled_at)` in shared schema + service validation.
- [x] Ensure unsupported combinations fail predictably with explicit validation/business-rule errors.
- [x] Include both accepted and rejected matrix examples in tests and docs.

### 3. Source-of-truth document alignment
- [x] Confirm and align source-of-truth docs before implementation if drift exists:
  - `docs/system/system-design/api-routes.md`
  - `docs/system/system-design/matching-tiers.md`
  - `docs/system/system-design/frontend-pages.md`
- [x] If contracts still imply unsupported direct peer-to-peer create behavior, update docs first.

### 4. Validation test coverage
- [x] Add/update service validation tests for the full matrix:
  - supported combinations
  - unsupported combinations
  - account-policy configuration behavior (not hardcoded)

## Implementation Notes
- Accepted examples:
  - `mode: 'ai_led'`, `scheduled_at: 'now'`, `free_ai_interviews > 0` → accepted, consumes free AI quota, resolves default tier label `standard`.
  - `mode: 'ai_led'`, scheduled ISO timestamp, `free_ai_interviews = 0`, `credits > 0` → accepted, consumes one credit, resolves default tier label `premium`.
- Rejected examples:
  - `mode: 'peer_to_peer'` on `POST /api/interviews` → rejected; Standard peer-to-peer remains matcher-owned.
  - direct payload with `interviewer_id` → rejected.
  - direct payload with client-selected `tier` → rejected.
  - `mode: 'ai_led'` with no free AI quota and no credits → rejected.

## End Goal
The create-path mode/account-policy behavior is fully locked, documented, and testable, preventing direct peer-to-peer drift and preserving matcher ownership for Standard sessions.
