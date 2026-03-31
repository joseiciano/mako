# Story 5.3: Scheduling Validation and Guardrail Behavior

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define per-step validation, blocked-combination guardrails, and user-visible error/loading behavior for scheduling submission safety.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-2-scheduling-step-map-and-navigation-rules.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/matching-tiers.md`

## What Needs to Be Done

### 1. Define per-step validation contracts
- [ ] Step 1 validation: enforce `system_design` for current Story 5 UI scope while keeping validation/mapping logic compatible with documented route enum expansion in `docs/system/system-design/api-routes.md`.
- [ ] Step 2 validation: allow only documented scheduling channels (`ai_led`, `peer_to_peer`).
- [ ] Step 3A (AI) validation:
  - `scheduled_at` constrained to ISO timestamp or `'now'`
  - prevent invalid time input before submission
  - reject/strip any client-submitted `tier` field before AI create dispatch (account policy resolved server-side)
- [ ] Step 3B (P2P) validation:
  - `interview_type` constrained to documented enum values
  - enforce 60-minute slot constraints and `start_time < end_time`
  - enforce positive `max_matches`
  - reject/strip any client-submitted `tier` field before availability submission (account policy resolved server-side)
  - ensure payload remains matcher-compatible per `docs/system/system-design/matching-tiers.md`

### 2. Define blocked-combination guardrails
- [ ] Block unsupported direct create combinations before submit, including:
  - `peer_to_peer` path attempting `POST /api/interviews`
  - direct create payloads implying `interviewer_id`
  - AI or P2P payloads carrying client-selected `tier`
  - AI direct-create payloads outside Story `3-2` matrix for `(mode, account policy, interviewer_id, scheduled_at)`
  - P2P availability payloads outside the documented `POST /api/availability` contract
- [ ] If Story `6-1` is not yet implemented, keep P2P submission on a contract-shaped frontend stub path (no live backend write) and surface explicit temporary-unavailable UX for final submit.
- [ ] Keep guardrails explicit in UX copy so users understand why an action is unavailable.

### 3. Define user-facing error semantics
- [ ] Define inline validation errors for field-level issues.
- [ ] Define step-level blocking errors for incomplete or invalid branch state.
- [ ] Define server-error handling for failed submits, including retry affordance with client-side duplicate-dispatch prevention and explicit user messaging about retry outcome.

### 4. Define disabled/loading and retry behavior
- [ ] Disable primary submit action while mutation is in-flight.
- [ ] Prevent double-submit race behavior and duplicate request dispatch.
- [ ] Define re-enable behavior and state preservation after retryable failures.

### 5. Validation and guardrail test coverage
- [ ] Add tests covering accepted/rejected combinations for both channels.
- [ ] Add tests covering disabled submit during in-flight mutation.
- [ ] Add tests verifying explicit user-facing error states for validation and server failure paths.

## End Goal
Scheduling validation and guardrails are explicit, branch-aware, and test-covered so unsupported combinations are blocked early with clear user feedback and safe retry UX.
