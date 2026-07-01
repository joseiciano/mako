# Story 3.10: Session Workflow Timer Orchestration

**Milestone**: Milestone 3: The Interview Experience (P2P Core)
**Description**: Implement workflow-backed timer orchestration for active interview sessions with deterministic timeout and warning behavior.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
- `docs/system/system-design/diagrams.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/infrastructure/backend.md`
- `docs/infrastructure/management.md`

## What Needs to Be Done

### 1. Trigger workflow orchestration from lifecycle start path
- [ ] Start Cloudflare Workflow timer orchestration only from successful `POST /api/interviews/:id/start` handling.
- [ ] Do not trigger timer orchestration from matcher flows, join provisioning route, or client-only behavior.
- [ ] Keep orchestration ownership aligned with `docs/system/system-design/diagrams.md` and `docs/infrastructure/backend.md`.

### 2. Enforce trigger-once and continuity behavior
- [ ] Enforce workflow start idempotency for repeated or concurrent start attempts on same interview so only one active timer orchestration exists.
- [ ] Persist or expose enough backend state for consumers to recover timer continuity after refresh/reconnect.
- [ ] Ensure client-visible timer continuity is sourced from backend/workflow state, not local-only countdown.

### 3. Implement timeout and warning semantics
- [ ] Implement 60-minute session timer behavior.
- [ ] Emit 5-minute warning semantics aligned with `docs/system/system-design/diagrams.md`.
- [ ] Ensure timer expiration transitions interview state to `completed` with idempotent retry safety.
- [ ] Ensure manual `end` path safely converges with timer completion path so terminal writes do not conflict.

### 4. Add backend workflow coverage
- [ ] Add/update backend tests for:
  - workflow trigger-once behavior
  - timer completion transition behavior
  - warning emission behavior
  - manual end vs timer completion convergence

## Implementation Notes
- Contract-level start/end route ownership stays in Story 3.8.
- Frontend timer rendering and controls stay in Story 3.11.
- Concurrency hardening and observability stay in Story 3.12.

## End Goal
Active interview sessions run on one deterministic workflow-backed timer with reconnect continuity, warning semantics, and safe timeout completion behavior.
