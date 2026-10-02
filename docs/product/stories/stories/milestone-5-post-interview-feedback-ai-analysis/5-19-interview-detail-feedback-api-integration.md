# Story 5.19: Interview Detail Feedback API Integration

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Expose participant-safe transcript, processing state, strict feedback, and authorized artifact URLs through the existing interview detail endpoint.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-9-interview-details-route-get-api-interviews-id.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-14-participant-artifact-read-api.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-18-feedback-reliability-observability-and-replay.md`

## What Needs to Be Done

### 1. Extend repository and service detail mapping
- [x] Update interview database schemas and row parsing under `packages/shared-backend/src/interviews/` for transcript, recording/feedback statuses, unavailable reason, artifact availability, safe error code, prompt version, generated timestamp, and strict feedback.
- [x] Keep private recording/screenshot keys and recording consent rows internal to repository/service logic.
- [x] Consume the participant-authorized artifact route URL mapping established by Story 5.14 in the detail response; do not recompute or duplicate the mapping logic.
- [x] Preserve participant-only authorization and established non-participant 404 behavior.

### 2. Return deterministic report states
- [x] Update `GET /api/interviews/:id` to return `feedback = null` until status is ready and a strict feedback object exists.
- [x] Return transcript only to participants and only when persisted; represent pending/failed/unavailable states through documented typed fields and artifact availability rather than placeholder prose or null inference.
- [x] Expose safe error codes only for failed processing and never return provider messages or workflow internals.
- [x] Continue excluding transcript, feedback processing fields, and raw artifact fields from `GET /api/interviews` list responses.

### 3. Add the lightweight feedback-status route
- [x] Document and implement participant-only `GET /api/interviews/:id/feedback-status` using the shared narrow response from Story 5.5.
- [x] Return status, unavailable reason, safe error code, schema/prompt version, and updated timestamp without transcript, feedback prose, artifact URLs, or private keys.
- [x] Preserve the same participant authorization and non-participant 404 semantics as interview detail.

### 4. Maintain API compatibility
- [x] Keep existing `recording_url`, `screenshot_urls`, and `feedback` field names while tightening their value contracts.
- [x] Update generated OpenAPI output and examples in `docs/system/system-design/api-routes.md` for unavailable, processing, failed, and ready responses.
- [x] Verify older rows with legacy URLs/freeform feedback are handled through explicit compatibility parsing or safely reported unavailable rather than crashing the endpoint.

### 5. Add API coverage
- [x] Add repository/service/controller tests for each processing state, strict ready feedback, transcript visibility, expired artifacts, and legacy rows.
- [x] Add tests proving participant roles can read the report while non-participants and unauthenticated callers cannot.
- [x] Add response-shape tests proving list responses remain narrow and detail responses never expose object keys, consent records, provider errors, or workflow IDs.
- [x] Add feedback-status tests for each state, participant authorization, and absence of large/sensitive detail fields.

## Implementation Notes
- The existing detail endpoint remains the full report source. The narrow status endpoint exists only to avoid repeatedly transferring a long transcript while polling.

## End Goal
The canonical detail endpoint provides the complete participant-safe report, while a narrow authorized status endpoint supports efficient polling without exposing private storage or provider internals.
