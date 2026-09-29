---
goal: Complete participant-authorized private artifact streaming for recordings and screenshots
date_created: 2026-09-20
last_updated: 2026-09-20
status: 'Completed'
tags: [feature, api, security, cloudflare-workers, r2, milestone-5]
---

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Complete Story 5.14 by validating and finalizing the existing participant-authorized artifact read implementation. The implementation exposes stable same-origin recording and screenshot routes, streams private R2 objects with browser-compatible range semantics, maps only normalized live artifacts into interview detail responses, and keeps all storage identifiers server-only.

## 1. Requirements & Constraints

- **REQ-001**: Implement `GET /api/interviews/:id/artifacts/recording` and `GET /api/interviews/:id/artifacts/screenshots/:captureId` through the existing interview controller/service/repository architecture.
- **REQ-002**: Return `401` for unauthenticated requests and preserve the established `404` response for authenticated users who are not the scheduler or interviewer for the requested interview.
- **REQ-003**: Resolve recording and screenshot identifiers exclusively through normalized `interview_artifacts` rows and server-owned object keys; never accept an R2 key as a route parameter.
- **REQ-004**: Return the durable availability values `not_created`, `processing`, `expired`, or `failed` when an artifact cannot be streamed, and omit availability fields from successful stream responses.
- **REQ-005**: Stream R2 response bodies without buffering complete recordings and support single HTTP byte ranges, `If-None-Match`, and `If-Range` for browser playback.
- **REQ-006**: Populate `recording_url` and `screenshot_urls` in `GET /api/interviews/:id` only from currently available normalized artifacts, using same-origin participant-authorized routes.
- **SEC-001**: Responses and logs must not expose R2 bucket names, object keys, provider asset identifiers, provider download URLs, or legacy database URL values.
- **SEC-002**: Successful streams must use an allowlisted content type, exact content length, ETag when available, `Accept-Ranges: bytes`, a safe inline content disposition, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.
- **SEC-003**: Reject invalid screenshot capture identifiers before database access and enforce object-key prefix validation inside the shared storage abstraction to prevent path/key injection.
- **CON-001**: Signed R2 URLs are outside the MVP contract; authorization remains request-scoped at application routes.
- **CON-002**: Do not add ad-hoc OpenAPI decorators or route metadata. Repository policy in `docs/coding/backend-instructions.md` defers generated OpenAPI tooling to a repository-wide initiative, so route contracts are expressed through shared Zod schemas, `docs/system/system-design/api-routes.md`, and contract tests.
- **GUD-001**: Reuse the canonical `@mako/shared-backend` interview-assets abstraction and direct SQL through the existing query executor; do not introduce a second storage abstraction or an ORM.
- **PAT-001**: Follow the existing controller-service-repository boundary: controller owns HTTP/auth/error mapping, service owns authorization and availability/stream decisions, repository owns parameterized normalized-row queries, and interview-assets owns R2 access.

## 2. Implementation Steps

### Implementation Phase 1: Shared contracts and storage primitives

- **GOAL-001**: Provide typed availability, safe object access, and deterministic range parsing shared by both artifact routes.

- [x] **TASK-001**: Add and export strict shared schemas for `ArtifactAvailability` and `{ availability }` responses in `packages/shared/src/interviews.ts` and `packages/shared/src/index.ts`.
- [x] **TASK-002**: Extend `packages/shared-backend/src/interview-assets/types.ts` and `artifact-storage.ts` with ranged object reads, HEAD metadata, R2 ETags, total object size, content type, and strict recording/screenshot key-prefix dispatch.
- [x] **TASK-003**: Implement and export `parseRangeHeader` in `packages/shared-backend/src/interview-assets/range-request.ts` for full, satisfiable single-range, suffix-range, open-ended-range, and unsatisfiable outcomes.

### Implementation Phase 2: Artifact resolution and streaming service

- **GOAL-002**: Resolve normalized artifact state and stream only participant-authorized, live objects.

- [x] **TASK-004**: Implement `ArtifactReadRepository` queries for the latest playback artifact, screenshot artifacts by interview/capture ID, screenshot URL candidates, and recording finalization status using parameterized SQL.
- [x] **TASK-005**: Implement `ArtifactReadService.streamRecording` and `streamScreenshot` with participant lookup through `InterviewRepository`, deleted/expired tombstone handling, finalization-state mapping, missing-object handling, and no arbitrary-key input.
- [x] **TASK-006**: Implement streaming outcomes for `200`, `206`, `304`, and `416`, including ETag matching, strong `If-Range` handling, exact `Content-Range`, and direct `ReadableStream` pass-through.
- [x] **TASK-007**: Implement `createInterviewArtifactUrlSource`, `recordingRouteUrl`, and `screenshotRouteUrl` so only live normalized rows produce same-origin route URLs.

### Implementation Phase 3: HTTP routes and detail mapping

- **GOAL-003**: Expose the read service through authenticated application routes and update interview details without leaking storage internals.

- [x] **TASK-008**: Register both GET routes in `packages/shared-backend/src/interviews/interview-controller.ts`, short-circuit unauthenticated requests with `401`, validate UUID route parameters, preserve non-participant `404`, and return `503` when database/R2 bindings are unavailable.
- [x] **TASK-009**: Add centralized artifact response mapping in the interview controller for availability JSON, direct streams, `304`, `416`, allowlisted content types, exact lengths, safe inline filenames, private/no-store caching, and anti-sniffing headers.
- [x] **TASK-010**: Wire `ArtifactReadRepository`, `ArtifactReadService`, the shared storage port, and both private R2 bindings in `apps/backend-rest/src/index.ts`; export the new read symbols from shared-backend indexes.
- [x] **TASK-011**: Inject the artifact URL source into `InterviewService.getInterview` and override legacy URL fields with normalized same-origin route URLs or `null`.
- [x] **TASK-012**: Document route parameters, authorization, availability outcomes, range/conditional semantics, and response headers in `docs/system/system-design/api-routes.md` without inventing a partial OpenAPI annotation convention.

- [x] **TASK-015**: Run an independent repository-aware code review through the `review` skill and save the first result to `code_reviews/5-14/code_review_1.md`.
- [x] **TASK-016**: Resolve every high- and medium-severity review finding, re-run focused verification, and repeat review until no high/medium findings remain.
- [x] **TASK-017**: Mark Story 5.14 and this plan completed after verification and review are clean.

- [x] **TASK-013**: Add focused tests for scheduler/interviewer access, unauthenticated and non-participant requests, missing/expired/failed/processing states, invalid capture IDs, ranges, conditional requests, response headers, key-prefix rejection, and response/log leakage.
- [x] **TASK-014**: Run affected-package typechecks and the artifact-read, range-request, and artifact-storage test suites; require zero failures.
- [ ] **TASK-015**: Run an independent repository-aware code review through the `review` skill and save the first result to `code_reviews/5-14/code_review_1.md`.
- [ ] **TASK-016**: Resolve every high- and medium-severity review finding, re-run focused verification, and repeat review until no high/medium findings remain.
- [ ] **TASK-017**: Mark Story 5.14 and this plan completed after verification and review are clean.

## 3. Alternatives

- **ALT-001**: Return signed R2 URLs in interview details. Rejected because URL expiry and authorization would leak into the public contract and storage/provider details could escape the application boundary.
- **ALT-002**: Proxy full objects by buffering them into memory before responding. Rejected because recordings can be large and browser playback requires streaming and byte ranges.
- **ALT-003**: Read legacy `interviews.recording_url` and `interviews.screenshot_urls` fields. Rejected because normalized artifact rows are the durable source of truth and legacy values may contain provider or storage URLs.
- **ALT-004**: Add feature-local OpenAPI annotations. Rejected because repository policy forbids partial annotation conventions until repository-wide OpenAPI generation is introduced.

## 4. Dependencies

- **DEP-001**: Story 5.5 shared feedback and processing contracts, including the normalized artifact availability vocabulary.
- **DEP-002**: Story 5.6 private R2 storage abstractions and `RECORDINGS_BUCKET`/`SCREENSHOTS_BUCKET` bindings.
- **DEP-003**: Story 5.9 screenshot upload path and normalized screenshot artifact rows.
- **DEP-004**: Story 5.11 recording finalization workflow, recording state rows, object keys, tombstones, and 30-day recording expiry.
- **DEP-005**: Existing interview participant lookup and non-participant `404` semantics from Story 3.9.
- **DEP-006**: Cloudflare R2 Workers API support for `head`, ranged `get`, `ReadableStream`, `size`, HTTP metadata, and HTTP ETags.

## 5. Files

- **FILE-001**: `packages/shared/src/interviews.ts` — artifact availability schemas and interview detail response fields.
- **FILE-002**: `packages/shared/src/index.ts` — shared contract exports.
- **FILE-003**: `packages/shared-backend/src/interview-assets/types.ts` — R2 range/object metadata port types.
- **FILE-004**: `packages/shared-backend/src/interview-assets/artifact-storage.ts` — private bucket routing, ranged reads, HEAD metadata, and key validation.
- **FILE-005**: `packages/shared-backend/src/interview-assets/range-request.ts` — byte-range parser.
- **FILE-006**: `packages/shared-backend/src/interview-assets/index.ts` — interview-assets exports.
- **FILE-007**: `packages/shared-backend/src/interviews/artifact-read-repository.ts` — normalized artifact/finalization read queries.
- **FILE-008**: `packages/shared-backend/src/interviews/artifact-read-service.ts` — authorization, availability, streaming, conditional request, and route URL logic.
- **FILE-009**: `packages/shared-backend/src/interviews/interview-controller.ts` — artifact routes and HTTP response mapping.
- **FILE-010**: `packages/shared-backend/src/interviews/interview-service.ts` — interview detail URL mapping.
- **FILE-011**: `packages/shared-backend/src/interviews/index.ts` — read API exports.
- **FILE-012**: `apps/backend-rest/src/index.ts` — worker binding and service construction.
- **FILE-013**: `docs/system/system-design/api-routes.md` — API contract documentation.
- **FILE-014**: `packages/shared-backend/src/interviews/artifact-read.test.ts` — route/service/repository/read-path behavior tests.
- **FILE-015**: `packages/shared-backend/src/interview-assets/range-request.test.ts` — range parser tests.
- **FILE-016**: `packages/shared-backend/src/interview-assets/artifact-storage.test.ts` — storage metadata, range forwarding, and key-safety tests.
- **FILE-017**: `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-14-participant-artifact-read-api.md` — story completion status.
- **FILE-018**: `plans/5-14-participant-artifact-read-api.md` — implementation and verification plan.

## 6. Testing

- **TEST-001**: Run `pnpm --filter @mako/shared-backend --filter @mako/shared --filter @mako/backend-rest typecheck` and require all affected packages to pass.
- **TEST-002**: Run `pnpm --filter @mako/shared-backend test -- --run src/interviews/artifact-read.test.ts src/interview-assets/range-request.test.ts src/interview-assets/artifact-storage.test.ts` and require all targeted tests to pass.
- **TEST-003**: Verify both scheduler and interviewer can stream available recording/screenshot bodies while unauthenticated requests return `401` and authenticated non-participants receive `404` without existence disclosure.
- **TEST-004**: Verify durable `not_created`, `processing`, `expired`, and `failed` availability responses, missing-object behavior, invalid capture IDs, and unavailable service bindings.
- **TEST-005**: Verify `200`, `206`, `304`, and `416` behavior, exact range bytes, `Content-Range`, `Content-Length`, ETag, `Accept-Ranges`, private/no-store caching, safe inline disposition, and `nosniff`.
- **TEST-006**: Verify response payloads and captured logs contain no bucket names, object keys, provider asset IDs, provider download URLs, or legacy URL values.
- **TEST-007**: After review fixes, re-run affected-package typechecks and focused tests, then run the complete workspace test suite if no unrelated environmental blocker exists.

## 7. Risks & Assumptions

- **RISK-001**: Incorrect R2 total-size handling on ranged reads can produce invalid `Content-Length` or `Content-Range` values; HEAD metadata remains the authoritative total size.
- **RISK-002**: Weak ETag matching for `If-Range` could return partial bytes from a changed object; only strong exact ETags may authorize a ranged response.
- **RISK-003**: Mapping URLs from legacy interview fields or unfiltered tombstones could expose storage details or dead media; the normalized live-row URL source must remain authoritative.
- **RISK-004**: Repository-wide OpenAPI work may later require migrating these schema-backed route contracts into a generated registry; feature-local annotations must not pre-empt that design.
- **ASSUMPTION-001**: Recording finalization persists playback artifact rows with `finalized_at`, `expires_at`, safe content metadata, and valid private object keys before marking the aggregate recording ready.
- **ASSUMPTION-002**: Screenshot uploads create normalized rows whose UUID ID is the public capture identifier and whose object key is never user-controlled.
- **ASSUMPTION-003**: Both participants are authorized at the interview level to read the interview's playback recording and captures.

## 8. Related Specifications / Further Reading

- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-14-participant-artifact-read-api.md`
- `docs/system/system-design/api-routes.md`
- `docs/coding/backend-instructions.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-9-interview-details-route-get-api-interviews-id.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-6-private-r2-storage-module-and-bindings.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-9-whiteboard-capture-upload-api.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-11-realtimekit-recording-finalization-webhook.md`
