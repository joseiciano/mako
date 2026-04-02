# Story 1.1: Matcher Scope and Dependencies

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Lock the Availability Matching Engine scope to Standard tier behavior and validate all required infrastructure and source-of-truth dependencies before implementation.
**Status**: Completed
**Last reconciled**: 2026-04-02 (Story 1.1 implementation)

## What Needs to Be Done

### 1. Source-of-truth alignment
- [x] Implement this story against the behavior defined in:
  - `docs/system/system-design/matching-tiers.md`
  - `docs/system/system-design/concurrency-data-integrity.md`
  - `docs/system/system-design/db-schemas.md`
  - `docs/system/system-design/state-management-lifecycle.md`
  - `docs/system/system-design/diagrams.md`
- [x] Keep scope limited to **Standard tier availability matching** only (not Premium manual matching, not AI-led).
- [x] Keep deterministic matcher rules aligned with the source-of-truth docs (60-minute slots, overlap checks, request quota checks, and deterministic role assignment for matcher-created interviews).

### 2. Infrastructure ownership and runtime dependencies
- [x] Confirm infrastructure dependencies from:
  - `docs/infrastructure/backend.md` (Workers/Hyperdrive/Workflows/Realtime stack)
  - `docs/infrastructure/management.md` (Terraform/Wrangler ownership)
  - `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md` (Greedy Matcher Worker + queue hand-off worker)
- [x] Confirm the Greedy Matcher runs as a **cron-triggered worker** and that any downstream hand-off uses the pre-provisioned queue infrastructure.

### 3. Boundary confirmation
- [x] Explicitly document that this story does **not** provision Realtime/whiteboard sessions during matching; provisioning remains join-time via `POST /api/interviews/:id/provision`.
- [x] Explicitly document that Premium first-to-claim matching and AI-led scheduling are out of scope for this subtask.

## Implementation Notes

- **In scope (Story 1.1 lock only)**:
  - Standard-tier availability matching guardrails only.
  - Matcher runs in cron-triggered worker context.
  - Match outcomes hand off to pre-provisioned queue-based downstream orchestration.
- **Out of scope**:
  - Premium first-to-claim matching behavior (future milestone scope).
  - AI-led interview scheduling behavior.
  - Realtime/whiteboard provisioning during match execution.
- **Lifecycle boundary**:
  - Realtime + whiteboard provisioning remains join-time route behavior via `POST /api/interviews/:id/provision`, consistent with lifecycle and diagrams source documents.


## End Goal
The Availability Matching Engine has a fully constrained Standard-tier scope and validated platform dependencies, preventing implementation drift before matcher logic is written.
