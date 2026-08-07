# Story 5.12: Session Recording Consent UI

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Add informed recording consent and recording-state indicators to the authenticated interview session experience.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/frontend-pages.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-11-session-lifecycle-frontend-controls-and-timer.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-8-recording-consent-and-realtimekit-control.md`

## What Needs to Be Done

### 1. Add typed consent mutations
- [ ] Add TanStack Query mutations under `apps/frontend/src/hooks/` for granting and revoking recording consent through the documented participant API.
- [ ] Invalidate the interview detail query after successful consent changes and prevent duplicate in-flight submissions.
- [ ] Map participant-safe API errors to actionable UI messages without exposing provider details.

### 2. Add informed consent presentation
- [ ] Add smart/dumb recording-consent components to the existing session route structure under `apps/frontend/src/routes/interviews/session/` or its established equivalent.
- [ ] Explain that audio/video may be recorded for transcript and AI feedback generation, raw artifacts are retained for 30 days, and consent can be declined without preventing the interview.
- [ ] Require an explicit user action; do not infer consent from joining, starting, prior interviews, or continued use.
- [ ] Show the current user's choice and overall recording state without exposing aggregate readiness that would reveal another participant's individual decision.

### 3. Render recording runtime states
- [ ] Render accessible indicators for waiting for consent, ready to record, recording, processing upload, ready, failed, and not recorded.
- [ ] Disable consent changes after recording begins and explain why the control is locked.
- [ ] Preserve existing video, whiteboard, AI chat, start/end, and timer controls.

### 4. Add frontend coverage
- [ ] Add hook tests for consent/revocation success, cache invalidation, duplicate-submit protection, and API errors.
- [ ] Add component tests for AI-led vs peer-to-peer copy, explicit consent/decline, consent-copy version, other-participant privacy, locked state, and keyboard/screen-reader behavior.
- [ ] Verify declining consent does not block the existing interview lifecycle controls.

## Implementation Notes
- Do not use a preselected checkbox or consent buried solely in general terms of service.
- The UI does not start recording directly; backend lifecycle and consent checks retain ownership.

## End Goal
Participants can make an informed, explicit recording choice and understand recording progress without disrupting the live interview experience or exposing another participant's private choice.
