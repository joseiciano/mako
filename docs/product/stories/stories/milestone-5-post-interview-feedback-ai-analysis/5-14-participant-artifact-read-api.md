# Story 5.14: Participant Artifact Read API

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Stream private recordings and whiteboard captures through participant-authorized application routes.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-9-interview-details-route-get-api-interviews-id.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-6-private-r2-storage-module-and-bindings.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-11-realtimekit-recording-finalization-webhook.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-9-whiteboard-capture-upload-api.md`

## What Needs to Be Done

### 1. Add participant-authorized streaming routes
- [ ] Document and implement `GET /api/interviews/:id/artifacts/recording` and `GET /api/interviews/:id/artifacts/screenshots/:captureId` with OpenAPI metadata.
- [ ] Require an authenticated interview participant and preserve established non-participant 404 semantics.
- [ ] Resolve capture/recording artifact IDs to normalized server-side artifact rows and keys; never accept or return arbitrary R2 keys.
- [ ] Return explicit `not_created`, `processing`, `expired`, or `failed` availability from durable state/tombstones when an artifact cannot be streamed; when an artifact is available, stream it directly without an availability status field.

### 2. Stream objects safely
- [ ] Stream R2 bodies without buffering complete recordings in memory and support HTTP range behavior required by browser media playback.
- [ ] Return allowlisted `Content-Type`, `Content-Length`, `ETag`, `Accept-Ranges`, and a safe inline content disposition from trusted object metadata.
- [ ] Use private/no-store cache semantics at the user-facing boundary unless a participant-safe cache design is documented.
- [ ] Prevent content sniffing and path/key injection.

### 3. Map detail payload URLs
- [ ] Populate `recording_url` and `screenshot_urls` in `GET /api/interviews/:id` as same-origin authorized route URLs only for available normalized artifacts.
- [ ] Keep legacy database URL fields out of new response mapping and keep object keys backend-only.

### 4. Add read-path tests
- [ ] Add tests for scheduler/interviewer access, non-participant/unauthenticated access, missing objects, expired objects, and invalid capture IDs.
- [ ] Add range-request and response-header tests for recording playback.
- [ ] Verify API responses and logs never expose bucket names, object keys, or provider download URLs.

## Implementation Notes
- Signed R2 URLs are not part of the MVP contract because expiry and authorization semantics would leak into the interview detail payload.
- Artifact availability may end before transcript/feedback retention; the UI must treat expired media independently from report availability.

## End Goal
Participants can play recordings and view captures through stable authorized routes while R2 remains private and storage identifiers remain server-only.
