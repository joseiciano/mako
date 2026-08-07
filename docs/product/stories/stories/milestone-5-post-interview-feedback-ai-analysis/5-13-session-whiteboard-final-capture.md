# Story 5.13: Session Whiteboard Final Capture

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Capture and upload a bounded final Excalidraw image from the session UI before interview completion.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/frontend-pages.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-4-whiteboard-excalidraw-sync-and-resilience.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-11-session-lifecycle-frontend-controls-and-timer.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-9-whiteboard-capture-upload-api.md`

## What Needs to Be Done

### 1. Add a reusable Excalidraw capture helper
- [ ] Add a focused frontend helper that exports the canonical current Excalidraw scene to a PNG Blob using established Excalidraw APIs.
- [ ] Normalize background, viewport, and scale for a legible bounded image while excluding collaborator cursors and transient UI controls.
- [ ] Return an explicit empty-scene result instead of uploading a meaningless blank image.

### 2. Integrate capture with session completion
- [ ] Add a TanStack Query mutation for screenshot upload under `apps/frontend/src/hooks/`; screenshot finalization has no client mutation.
- [ ] On an explicit end-session action, attempt one final capture/upload before calling the existing end route; the successful backend completion transition finalizes the set.
- [ ] Prevent duplicate clicks from uploading duplicate captures and preserve idempotency across mutation retries.
- [ ] Ensure capture failure does not strand the interview in `ongoing`; allow the user to continue ending with a clear warning that whiteboard feedback may be incomplete.

### 3. Handle timeout and peer behavior
- [ ] Ensure workflow timeout completion does not depend on browser capture success or an open browser tab.
- [ ] Let backend completion own peer-to-peer finalization and handle late/duplicate capture rejection through the API contract.
- [ ] Do not upload on every canvas change, pointer event, or periodic short interval.

### 4. Add frontend tests
- [ ] Add tests for populated and empty scene export, upload-before-end ordering, duplicate-click protection, and retry idempotency.
- [ ] Add tests proving end-session remains available when export/upload fails and displays the degraded-feedback warning.
- [ ] Verify existing Excalidraw synchronization and session controls remain functional.

## Implementation Notes
- MVP captures one final image per participating client at most; additional explicit checkpoints can be added later within the server limit.
- The canonical collaborative scene remains Excalidraw JSON in the live room; PNG is a derived post-interview artifact.

## End Goal
Ending a browser session produces a bounded, private final whiteboard capture when possible without making interview completion dependent on client-side image generation.
