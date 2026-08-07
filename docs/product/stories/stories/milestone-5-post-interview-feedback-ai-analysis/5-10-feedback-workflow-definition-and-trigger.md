# Story 5.10: Feedback Workflow Definition and Trigger

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Add a dedicated Cloudflare Workflow for post-interview processing and trigger it idempotently from completed events.
**Status**: Todo
**Prerequisites**:
- `docs/infrastructure/backend.md`
- `docs/system/system-design/ai-feedback-pipeline.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-6-private-r2-storage-module-and-bindings.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-7-interview-completed-feedback-event.md`

## What Needs to Be Done

### 1. Define the feedback workflow shell
- [ ] Add `InterviewFeedbackWorkflow` in `apps/notification-orchestrator/` as a proper Cloudflare `WorkflowEntrypoint` with a Zod-validated `{ interview_id, schema_version }` payload.
- [ ] Keep `InterviewLifecycleWorkflow` timer responsibilities unchanged and move feedback-specific code into focused workflow/service files rather than expanding `apps/notification-orchestrator/src/index.ts`.
- [ ] Define stable step names for eligibility load, processing claim, artifact readiness, transcription, analysis, persistence, and terminal failure handling.

### 2. Configure workflow and service bindings
- [ ] Make Terraform the owner of production Workflow resources/bindings and mirror them in `apps/notification-orchestrator/wrangler.jsonc` for local development; narrow any `ignore_changes.bindings` behavior that would discard production binding updates.
- [ ] Add the Workers AI `AI` binding to the notification-orchestrator Worker and retain R2, Hyperdrive, and queue bindings required by later steps.
- [ ] Configure the AI Gateway URL/account/gateway identifiers as variables and provider/BYOK authorization as notification-orchestrator secrets; do not model AI Gateway as a generic Worker binding.
- [ ] Add the AI Gateway provider/BYOK authorization secret to `scripts/set-github-env-secrets.sh` so deployment workflows can configure it.
- [ ] Update Worker binding types and regenerate Cloudflare environment types.
- [ ] Document local workflow development and required bindings in `docs/infrastructure/backend.md` and local testing docs.

### 3. Add idempotent trigger and processing claim
- [ ] On `interview.completed`, use `createBatch` with deterministic ID `feedback-v1-{interview_id}` or explicitly confirm an existing instance so duplicate queue deliveries are created-or-confirmed without retry/DLQ loops.
- [ ] Reload canonical interview status, recording state, screenshot finalization, type, mode, tier, and candidate alias from Postgres.
- [ ] Claim work with a generated attempt ID and conditional `pending -> processing` SQL update that writes processing start time; no-op safely when feedback is already ready, actively processing, or ineligible.
- [ ] Fence every transcript, ready, and failure write by the current attempt ID so a stale/restarted workflow cannot mutate a newer attempt.
- [ ] Open and release database connections within workflow steps rather than retaining a connection across sleeps or external inference.

### 4. Add workflow-shell tests
- [ ] Add tests for valid/invalid event payloads, deterministic instance IDs, duplicate delivery, eligibility checks, and conditional claim behavior.
- [ ] Add tests proving lifecycle timer workflow behavior is unchanged.
- [ ] Add configuration-readiness tests for feedback workflow, R2, Hyperdrive, Workers AI, AI Gateway variables, and provider authorization secrets.

## Implementation Notes
- Workflow step results must remain serializable and bounded; do not return full audio, screenshot bytes, or large transcript content as persisted step output.
- Version the workflow instance ID so a future schema version can be operationally replayed without colliding with retained v1 instances.

## End Goal
Completed-event delivery starts one dedicated feedback workflow that safely claims eligible work and provides stable orchestration boundaries for transcription and analysis.
