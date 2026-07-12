# Story 3.12: Session Lifecycle Concurrency and Observability

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Harden lifecycle implementation against race conditions and add production-safe telemetry for lifecycle actions and timer events.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-10-session-workflow-timer-orchestration.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-11-session-lifecycle-frontend-controls-and-timer.md`
- `docs/system/system-design/concurrency-data-integrity.md`
- `docs/system/system-design/db-schemas.md`

## What Needs to Be Done

### 1. Apply concurrency safeguards to lifecycle writes
- [x] Apply atomic SQL transition safeguards from `docs/system/system-design/concurrency-data-integrity.md` so concurrent participant actions cannot produce conflicting lifecycle state.
- [x] Ensure repeated or competing `start`/`end` actions converge to one deterministic persisted outcome.
- [x] Validate terminal state writes remain safe when workflow timeout and manual user actions race.

### 2. Add concurrency-focused backend coverage
- [x] Add/update backend tests for:
  - concurrent `start` race handling
  - concurrent `end` race handling
  - `start` vs `end` race handling
  - workflow completion vs manual end race handling

### 3. Add lifecycle observability without leaking secrets
- [x] Add structured logs or telemetry points for lifecycle actions and timer events:
  - `start_requested`
  - `start_succeeded`
  - `end_requested`
  - `end_succeeded`
  - `timer_warning`
  - `timer_completed`
- [x] Ensure lifecycle logs do not leak Realtime tokens, `excalidraw_key`, or other sensitive provisioning credentials.
- [x] Keep enough context in telemetry for production debugging of retries, failures, and timer convergence.

### 4. Reconcile lifecycle docs after hardening
- [x] Reconcile any lifecycle implementation changes back into system docs.

## Implementation Notes

### Observability hardened in this pass
- `apps/backend-rest/src/index.ts`: `consoleInterviewServiceLogger` and `consoleNotificationDispatchLogger` now emit structured JSON objects (`{ event, component, ...context }`) instead of string-interpolated logs. No sensitive fields logged.
- `apps/backend-rest/src/workflows/session-timer-workflow.ts`: Extracted `buildTimerWarningLog` and `buildTimerCompletedLog` pure helpers. Workflow now delegates log construction to these testable functions. All timer logs include `event`, `interview_id`, `expires_at`, `source: 'workflow'` with no sensitive fields (`realtime_session_id`, `excalidraw_key`, `excalidraw_room_id`, `token`).
- `apps/backend-rest/src/workflows/session-timer-workflow.test.ts`: 10 tests covering pure log builders (structured shape, sensitive-field absence) and integration tests for warning emission, `not_found` completion, `already_completed` completion, and universal sensitive-field absence.

### Concurrency safeguards (implemented in this pass)
- Atomic SQL `UPDATE ... WHERE status = 'scheduled'/'ongoing'` guards with participant scope prevent conflicting lifecycle writes.
- Serialization failure (40001) and deadlock (40P01) retry logic up to 3 attempts.
- Fallback SELECT classifies `already_ongoing`, `already_completed`, `invalid_status`, and `not_found` outcomes.
- `started_at` precondition guard on `end` action prevents workflow/manual race conflicts.

## End Goal
Lifecycle flows stay deterministic under concurrent actions and produce production-safe telemetry that supports debugging without exposing sensitive session credentials.
