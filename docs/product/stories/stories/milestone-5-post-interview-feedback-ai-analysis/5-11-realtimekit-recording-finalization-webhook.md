# Story 5.11: RealtimeKit Recording Finalization Webhook

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Accept signed RealtimeKit recording updates and hand durable composite/participant-audio finalization to a dedicated workflow.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-6-private-r2-storage-module-and-bindings.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-8-recording-consent-and-realtimekit-control.md`

## What Needs to Be Done

### 1. Add the signed webhook boundary
- [ ] Document and implement `POST /api/webhooks/realtimekit` in `apps/backend-rest/` as a provider webhook route that does not use browser-session authentication.
- [ ] Read raw request bytes and verify Base64 RSA-SHA256 `rtk-signature` using a cached, refreshable public key from `https://api.realtime.cloudflare.com/.well-known/webhooks.json` before parsing JSON.
- [ ] Validate the supported `recording.statusUpdate` payload and acknowledge unsupported, validly signed event types without side effects.
- [ ] Use `rtk-uuid` and `realtimekit_webhook_events` to make duplicate delivery safe.

### 2. Accept and map provider state durably
- [ ] Map RealtimeKit `INVOKED`, `RECORDING`, `UPLOADING`, `UPLOADED`, and `ERRORED` updates to valid internal recording transitions without permitting state regression. Use the following mapping to `realtimekit_webhook_events` status: `INVOKED`/`RECORDING` → `accepted`, `UPLOADING` → `finalizing`, `UPLOADED` → `processed`, `ERRORED` → `failed`.
- [ ] Resolve the specific `interview_recordings` row and owning interview by persisted provider recording ID rather than trusting interview/user identifiers in webhook payloads.
- [ ] Treat out-of-order and repeated states as idempotent no-ops while preserving diagnostics.
- [ ] In one short transaction, persist the accepted webhook event/checkpoint and provider state, then return `2xx`; do not download media in the webhook request.
- [ ] Persist only safe error codes for terminal provider failures and make accepted/failed checkpoints eligible for a bounded scheduled sweep.

### 3. Add a dedicated recording-finalization workflow
- [ ] Add `RecordingFinalizationWorkflow` to `apps/notification-orchestrator/` and configure Terraform production ownership plus mirrored local Wrangler bindings; trigger one deterministic instance per provider-recording ID after accepted `UPLOADED` events. Note: the notification-orchestrator Terraform resource currently has `ignore_changes` on bindings; coordinate with Story 5.10's `ignore_changes` narrowing so Terraform-managed production workflow/binding updates take effect.
- [ ] Use `createBatch` or confirm an existing deterministic instance so duplicate webhook delivery is acknowledged without parallel copies.
- [ ] Fetch fresh recording/track status and short-lived download URLs from RealtimeKit by provider ID inside the workflow; never persist signed URLs.
- [ ] Stream composite output for playback and participant-specific tracks for transcription into `RECORDINGS_BUCKET`, validating HTTPS origin, response status, content type, participant/role mapping, and bounded metadata; never use mixed composite audio for scoring.
- [ ] Persist normalized artifact rows with finalization/expiry timestamps, finalize each recording job independently, and derive aggregate ready only after every required candidate/participant track and playback object is visible in R2.
- [ ] Retry accepted/failed checkpoints by recording ID through the scheduled sweeper; do not delegate recording transfer to `InterviewFeedbackWorkflow`.

### 4. Add webhook and streaming tests
- [ ] Add tests for valid/invalid signatures, duplicate event UUIDs, unsupported event types, out-of-order updates, and unknown recording IDs.
- [ ] Add tests for public-key refresh/cache failure, raw-body verification, deterministic workflow creation, and fast webhook acknowledgement.
- [ ] Add tests proving large recordings are streamed rather than materialized as one in-memory buffer.
- [ ] Add tests for fresh-URL lookup, provider download/R2 failures, composite vs track jobs, AI-led candidate mapping, peer role mapping, aggregate readiness, checkpoint sweep recovery, and one artifact row per finalized provider asset.

## Implementation Notes
- RealtimeKit-managed recording links have limited lifetime, so the finalization workflow always refreshes provider state/URLs by recording ID before copy.
- Track-recording support and output format must be verified with the production RealtimeKit account before enabling peer-to-peer feedback.

## End Goal
Signed RealtimeKit events are accepted quickly and result in private composite/participant-audio artifacts through one retry-safe finalization workflow despite duplicate or out-of-order delivery.
