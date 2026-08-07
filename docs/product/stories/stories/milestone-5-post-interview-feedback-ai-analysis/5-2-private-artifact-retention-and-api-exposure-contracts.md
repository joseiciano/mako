# Story 5.2: Private Artifact, Retention, and API Exposure Contracts

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Lock the private artifact storage, retention, and API exposure contracts for post-interview feedback before implementation begins.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/milestones.md`
- `docs/product/system-pitch.md`
- `docs/system/system-design/db-schemas.md`
- `docs/system/system-design/api-routes.md`
- `docs/infrastructure/backend.md`

## What Needs to Be Done

### 1. Lock private artifact and retention contracts
- [x] Update `docs/system/system-design/db-schemas.md`, `docs/system/system-design/api-routes.md`, and `docs/infrastructure/backend.md` to store private R2 object keys rather than public R2 URLs.
- [x] Define deterministic object-key prefixes under `interviews/{interview_id}/` without user identifiers, aliases, emails, or original filenames.
- [x] Define participant-authorized application routes as the only browser access path for recordings and screenshots; raw keys, provider download URLs, and public `r2.dev` URLs must never be returned.
- [x] Set the MVP retention policy to 30 days for raw recordings and screenshots. Retain transcript and feedback with the interview until interview/account deletion.
- [x] Define account deletion (soft-delete via `DELETE /api/account`) to remove the shared interview's raw artifacts, transcript, and feedback for all participants when any recorded participant exercises deletion; do not retain another copy under the counterpart's access.

### 2. Lock artifact availability and API exposure contracts
- [x] Define artifact availability values (`not_created`, `processing`, `expired`, `failed`) as explicit statuses returned when an artifact cannot be streamed; `available` is the implicit success case where the object is streamed directly and no availability status field is returned, so clients do not infer consent, history, or retention outcomes from null URLs.
- [x] Define transcript and feedback as participant-only fields returned by `GET /api/interviews/:id`; keep them excluded from `GET /api/interviews`.
- [x] Define a participant-only lightweight `GET /api/interviews/:id/feedback-status` response for polling so active processing does not repeatedly transfer the full transcript/detail payload.
- [x] Enumerate all new API routes to be documented in `docs/system/system-design/api-routes.md` before implementation: `POST /api/interviews/:id/recording-consent` and `DELETE /api/interviews/:id/recording-consent` (participant consent), `POST /api/webhooks/realtimekit` (signed provider webhook), `POST /api/interviews/:id/artifacts/screenshots` (whiteboard capture upload), `GET /api/interviews/:id/artifacts/recording` and `GET /api/interviews/:id/artifacts/screenshots/:captureId` (participant-authorized artifact streaming), and `GET /api/interviews/:id/feedback-status` (lightweight polling).

## Implementation Notes
- Whiteboard captures are bounded PNG artifacts generated from the canonical Excalidraw scene at explicit milestones/finalization, not per-stroke uploads.
- Screenshot upload remains open while the interview is ongoing; the first successful lifecycle completion transaction finalizes the set for both manual-end and timeout paths.

## End Goal
The source-of-truth documentation defines one implementable MVP contract for private artifact storage, retention, deletion, artifact availability, and API exposure without leaving storage or API-exposure choices to downstream tickets.
