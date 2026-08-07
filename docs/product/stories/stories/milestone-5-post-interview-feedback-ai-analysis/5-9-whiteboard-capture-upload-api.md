# Story 5.9: Whiteboard Capture Upload API

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Add participant-authorized, bounded whiteboard PNG upload behavior and finalize the capture set from the canonical completion transition.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-1-whiteboard-scope-and-contract-boundaries.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-4-whiteboard-excalidraw-sync-and-resilience.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-6-private-r2-storage-module-and-bindings.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-7-interview-completed-feedback-event.md`

## What Needs to Be Done

### 1. Define the upload route
- [ ] Document and implement participant-only `POST /api/interviews/:id/artifacts/screenshots` with OpenAPI-backed shared schemas.
- [ ] Accept PNG capture bodies only for `ongoing` interviews and reject unauthenticated users/non-participants using established interview authorization semantics.
- [ ] Keep object key generation server-owned and return a stable capture ID rather than an R2 key.
- [ ] Reject new uploads after `screenshots_finalized_at` is set by the first successful completion transition.

### 2. Persist captures safely
- [ ] Validate content type, non-empty body, configured maximum bytes, and configured maximum captures per interview before writing.
- [ ] Persist each capture through the private R2 module and insert one normalized artifact row so simultaneous participant uploads do not lose entries.
- [ ] Deduplicate retried uploads with a client-generated idempotency token enforced by the artifact table's interview-scoped unique constraint.
- [ ] Delete an R2 object or record a cleanup checkpoint if the database write fails after upload.

### 3. Finalize captures from lifecycle completion
- [ ] Extend the same atomic repository transition used by manual end and workflow timeout to set `screenshots_finalized_at` on the first successful `ongoing -> completed` write. Story 5.7 owns the canonical completion transaction (outbox event + feedback eligibility); this story extends that same transaction with screenshot finalization.
- [ ] Treat repeated/concurrent completion as idempotent and preserve the first finalization timestamp.
- [ ] Treat zero screenshot artifact rows at finalization as a valid empty set; screenshot absence must not block feedback.

### 4. Add backend tests
- [ ] Add controller/service tests for authorization, lifecycle state, content type, size/count limits, completion-owned finalization, and safe error mapping.
- [ ] Add repository concurrency tests proving simultaneous inserts retain all unique captures and completion finalization is one-way.
- [ ] Add manual-end and workflow-timeout tests proving both finalize populated and empty capture sets.
- [ ] Add integration tests proving no object key appears in the API response or logs.

## Implementation Notes
- This API stores rendered artifacts for later report display and AI analysis; it does not replace Excalidraw collaboration state.
- Capture frequency is explicit and bounded. Per-stroke or timer-driven high-frequency uploads are prohibited.

## End Goal
Authorized session clients can persist a small, deduplicated set of whiteboard images while canonical lifecycle completion finalizes the set without exposing private storage identifiers.
