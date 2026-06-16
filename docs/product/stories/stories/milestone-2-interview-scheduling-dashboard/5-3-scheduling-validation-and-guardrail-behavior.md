# Story 5.3: Scheduling Validation and Guardrail Behavior

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define per-step validation, blocked-combination guardrails, and user-visible error/loading behavior for scheduling submission safety.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-2-scheduling-step-map-and-navigation-rules.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/matching-tiers.md`

## What Needs to Be Done

### 1. Define per-step validation contracts
- [x] Step 1 validation: enforce `system_design` for current Story 5 UI scope while keeping validation/mapping logic compatible with documented route enum expansion in `docs/system/system-design/api-routes.md`.
- [x] Step 2 validation: allow only documented scheduling channels (`ai_led`, `peer_to_peer`).
- [x] Step 3A (AI) validation:
  - `scheduled_at` constrained to ISO timestamp or `'now'`
  - prevent invalid time input before submission
  - reject/strip any client-submitted `tier` field before AI create dispatch (account policy resolved server-side)
- [x] Step 3B (P2P) validation:
  - `interview_type` constrained to documented enum values
  - enforce 60-minute slot constraints and `start_time < end_time`
  - enforce positive `max_matches`
  - reject/strip any client-submitted `tier` field before availability submission (account policy resolved server-side)
  - ensure payload remains matcher-compatible per `docs/system/system-design/matching-tiers.md`

### 2. Define blocked-combination guardrails
- [x] Block unsupported direct create combinations before submit, including:
  - `peer_to_peer` path attempting `POST /api/interviews`
  - direct create payloads implying `interviewer_id`
  - AI or P2P payloads carrying client-selected `tier`
  - AI direct-create payloads outside Story `3-2` matrix for `(mode, account policy, interviewer_id, scheduled_at)`
  - P2P availability payloads outside the documented `POST /api/availability` contract
- [x] If Story `5-4` is not yet implemented, keep P2P submission on a contract-shaped frontend stub path (no live backend write) and surface explicit temporary-unavailable UX for final submit.
- [x] Keep guardrails explicit in UX copy so users understand why an action is unavailable.

### 3. Define user-facing error semantics
- [x] Define inline validation errors for field-level issues.
- [x] Define step-level blocking errors for incomplete or invalid branch state.
- [x] Define server-error handling for failed submits, including retry affordance with client-side duplicate-dispatch prevention and explicit user messaging about retry outcome.

### 4. Define disabled/loading and retry behavior
- [x] Disable primary submit action while mutation is in-flight.
- [x] Prevent double-submit race behavior and duplicate request dispatch.
- [x] Define re-enable behavior and state preservation after retryable failures.

### 5. Validation and guardrail test coverage
- [x] Add tests covering accepted/rejected combinations for both channels.
- [x] Add tests covering disabled submit during in-flight mutation.
- [x] Add tests verifying explicit user-facing error states for validation and server failure paths.

## End Goal
Scheduling validation and guardrails are explicit, branch-aware, and test-covered so unsupported combinations are blocked early with clear user feedback and safe retry UX.

## Implementation Notes
- `schedule-flow.ts` exposes `getFieldErrors`, `hasFieldErrors`, `isSupportedInterviewType`, and `isSupportedMode` helpers. Field errors are cleared on every state change via the reducer.
- AI payload builder returns an exact allowlist `{ type, mode: 'ai_led', scheduled_at }`; P2P payload builder returns `{ interview_type, max_matches, slots }`. No `tier` or `interviewer_id` is ever included.
- `ScheduleSmart` uses a `useRef` dispatch guard to prevent same-tick double clicks from triggering multiple mutations.
- P2P final submit now dispatches the contract-shaped availability payload to `POST /api/availability` and shows asynchronous matcher-processing copy after acceptance.
- `createAvailability` in `use-availability.ts` validates the request schema with Zod before fetch, posts to the availability route, validates the response schema, and surfaces backend errors without creating interview rows client-side.
- All inputs, back buttons, and submit buttons are disabled while `isSubmitting` is true.
