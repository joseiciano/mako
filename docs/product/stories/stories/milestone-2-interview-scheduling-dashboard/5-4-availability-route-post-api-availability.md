# Story 5.4: Availability Create Route (`POST /api/availability`)

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Implement authenticated availability submission with explicit contract ownership for the Standard peer-to-peer matcher path.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-1-matcher-scope-and-dependencies.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-3-transactional-match-and-interview-write.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/matching-tiers.md`
- `docs/system/system-design/db-schemas.md`

## What Needs to Be Done

### 1. Scope and ownership lock for `POST /api/availability`
- [ ] Lock Story 5.4 ownership for Standard availability request creation via `POST /api/availability`.
- [ ] Keep matcher-owned interview creation boundaries intact: availability route writes availability request/slots only and does not directly create interview rows.
- [ ] Keep AI-led create ownership in Story 3 (`POST /api/interviews`) unchanged.

### 2. Shared contract/schema ownership
- [ ] Define or confirm shared request/response schema ownership for `POST /api/availability` in a story-owned shared contract module.
- [ ] Ensure request/response schemas align with `docs/system/system-design/api-routes.md` route contract fields and validation rules.
- [ ] Export availability contracts from shared package index for frontend/backend reuse.

### 3. Backend route behavior
- [ ] Require authenticated session and reject unauthenticated requests.
- [ ] Validate request body and enforce route rules:
  - `interview_type` constrained to documented enum values.
  - `max_matches` must be positive.
  - each slot must be exactly 60 minutes.
  - `start_time < end_time`.
- [ ] Persist availability request and slots deterministically with explicit validation/business-rule errors for unsupported input.

### 4. Route tests and drift gates
- [ ] Add route/contract tests for auth rejection, schema rejection, accepted payloads, and deterministic persistence behavior.

## End Goal
`POST /api/availability` has explicit, story-tracked contract and route ownership for Standard P2P scheduling input, enabling Scheduling Flow to integrate without contract ambiguity.
