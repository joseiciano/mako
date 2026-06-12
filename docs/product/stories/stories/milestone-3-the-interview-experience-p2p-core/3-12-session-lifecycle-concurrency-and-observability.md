# Story 3.12: Session Lifecycle Concurrency and Observability

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Harden lifecycle implementation against race conditions and add production-safe telemetry for lifecycle actions and timer events.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-10-session-workflow-timer-orchestration.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-11-session-lifecycle-frontend-controls-and-timer.md`
- `docs/system/system-design/concurrency-data-integrity.md`
- `docs/system/system-design/db-schemas.md`

## What Needs to Be Done

### 1. Apply concurrency safeguards to lifecycle writes
- [ ] Apply atomic SQL transition safeguards from `docs/system/system-design/concurrency-data-integrity.md` so concurrent participant actions cannot produce conflicting lifecycle state.
- [ ] Ensure repeated or competing `start`/`end` actions converge to one deterministic persisted outcome.
- [ ] Validate terminal state writes remain safe when workflow timeout and manual user actions race.

### 2. Add concurrency-focused backend coverage
- [ ] Add/update backend tests for:
  - concurrent `start` race handling
  - concurrent `end` race handling
  - `start` vs `end` race handling
  - workflow completion vs manual end race handling

### 3. Add lifecycle observability without leaking secrets
- [ ] Add structured logs or telemetry points for lifecycle actions and timer events:
  - `start_requested`
  - `start_succeeded`
  - `end_requested`
  - `end_succeeded`
  - `timer_warning`
  - `timer_completed`
- [ ] Ensure lifecycle logs do not leak Realtime tokens, `excalidraw_key`, or other sensitive provisioning credentials.
- [ ] Keep enough context in telemetry for production debugging of retries, failures, and timer convergence.

### 4. Reconcile lifecycle docs after hardening
- [ ] Reconcile any lifecycle implementation changes back into:
  - `docs/system/system-design/api-routes.md`
  - `docs/system/system-design/diagrams.md`
  - `docs/system/system-design/frontend-pages.md`
  - `docs/system/system-design/state-management-lifecycle.md`

## End Goal
Lifecycle flows stay deterministic under concurrent actions and produce production-safe telemetry that supports debugging without exposing sensitive session credentials.
