# Story 5.20: Feedback Report Route and Presentation

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Build the authenticated post-interview report with processing states, scores, transcript, evidence, recording playback, and whiteboard captures.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/frontend-pages.md`
- `docs/infrastructure/frontend.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-19-interview-detail-feedback-api-integration.md`

## What Needs to Be Done

### 1. Add the authenticated route and query behavior
- [x] Add `_authenticated.interviews.$id.feedback.tsx` and route-specific smart/dumb files under `apps/frontend/src/routes/interviews/feedback/` following established TanStack Router and smart/dumb component patterns.
- [x] Reuse the typed interview detail query in `apps/frontend/src/hooks/use-interviews.ts` or a focused report hook; do not create a duplicate API client contract.
- [x] Poll the lightweight feedback-status route only while status is `pending` or `processing`; on ready, invalidate and fetch interview detail once.
- [x] Use bounded backoff, disable background polling, pause while the document is hidden, and stop automatic polling after a client deadline in favor of manual refresh without changing server state.
- [x] Handle participant-safe 404, unauthenticated redirect, network failure, and retry through TanStack Query state.

### 2. Render all report states
- [x] Render distinct accessible states for interview not completed, no recording consent/feedback unavailable, pending, processing, failed with safe retry guidance, and ready.
- [x] Keep the report useful when 30-day raw artifacts have expired by continuing to render transcript and feedback.
- [x] Provide a navigation path from interview details/history to the report only when the interview is completed.

### 3. Build the ready report presentation
- [x] Render overall score, concise summary, communication/problem-solving/technical-depth score cards, evidence-backed strengths, and prioritized improvement actions.
- [x] Render the transcript in a readable collapsible section and preserve line breaks without executing/rendering transcript content as HTML.
- [x] Add recording playback through the authorized recording route with loading/error/expired states and accessible controls.
- [x] Render authorized whiteboard captures as a responsive gallery with meaningful alt text, expanded viewing, and per-image failure handling.
- [x] Present scores as coaching signals rather than hire/no-hire outcomes and display the report generation timestamp/version where useful.

### 4. Add responsive and accessible behavior
- [x] Build mobile-first layouts with logical heading hierarchy, sufficient contrast, keyboard navigation, visible focus, and non-color-only score indicators.
- [x] Avoid large eager media downloads: use native media loading behavior and lazy-load screenshot images below the fold.
- [x] Ensure long transcript/evidence text wraps without breaking the page and score visuals have screen-reader text equivalents.

### 5. Add frontend coverage
- [x] Add hook tests for narrow status polling, bounded backoff/deadline, hidden/background pause, terminal stop conditions, ready-detail invalidation, refetch/retry, and cache reuse.
- [x] Add route/component tests for every report state, participant-safe 404, raw-asset expiry, long content, empty screenshots, and partial media failures.
- [x] Add accessibility checks for headings, landmarks, focus order, media controls, image alternatives, and score semantics.

## Implementation Notes
- Do not add report editing, transcript correction, sharing/public links, PDF export, or participant-triggered regeneration in MVP.
- Keep the dumb report component free of HTTP, auth, router, and polling logic.

## End Goal
Participants can open `/interviews/:id/feedback` and understand processing progress or review a complete, accessible coaching report with transcript and available private session artifacts.
