# Story 5.1: Feedback Lifecycle, Consent, and Processing State Contracts

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Lock the lifecycle, consent, and processing-state contracts for post-interview feedback before implementation begins.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/milestones.md`
- `docs/product/system-pitch.md`
- `docs/system/system-design/ai-feedback-pipeline.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/db-schemas.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-10-session-workflow-timer-orchestration.md`

## What Needs to Be Done

### 1. Lock feedback eligibility and lifecycle ownership
- [ ] Update `docs/system/system-design/ai-feedback-pipeline.md` and `docs/system/system-design/state-management-lifecycle.md` so the first successful `ongoing -> completed` transition is the only source event for feedback processing.
- [ ] Define recording consent as an explicit precondition: AI-led sessions require the candidate's consent and peer-to-peer sessions require both participants' consent; declining must not block the interview but makes automated feedback unavailable.
- [ ] Keep timer ownership in `InterviewLifecycleWorkflow` and define a separate `InterviewFeedbackWorkflow` in the same notification-orchestrator Worker so timer failures and AI-analysis failures have independent retry domains.
- [ ] Define operational replay as the only MVP regeneration path; do not expose user-triggered regeneration or automatically process historical interviews.
- [ ] Define participant-attributed transcription inputs: AI-led sessions require a candidate-specific audio track, while peer-to-peer sessions require participant-separated RealtimeKit audio tracks mapped to scheduler/interviewer roles before they are eligible for scored feedback; composite audio is playback-only.

### 2. Lock processing and report state contracts
- [ ] Define dedicated transcript persistence instead of embedding transcript text inside `interviews.feedback`.
- [ ] Define `feedback_status` values and transitions for `not_started`, `pending`, `processing`, `ready`, and `failed`, plus safe client-facing error codes that do not expose provider messages.
- [ ] Define a separate `feedback_unavailable_reason` with enumerated values (`no_consent`, `unsupported_format`, `no_recording`) for the `not_started` state so clients do not infer ineligibility from null fields; distinguish these from `feedback_error_code` values (`assets_not_ready`, `transcription_failed`, `analysis_failed`, `invalid_feedback`, `internal_error`) used for the `failed` state.
- [ ] Define the unavailable transition matrix: completion-time ineligibility stays `not_started` with a safe reason; unsupported track format/mapping discovered after claim transitions attempt-fenced `processing -> not_started` with a reason; infrastructure/inference exhaustion transitions `processing -> failed` with an error code.

## Implementation Notes
- Use RealtimeKit server-controlled composite recording plus participant-separated audio tracks with a 3,600-second maximum and a public-key-verified status webhook; do not upload a browser-composed full-session recording.

## End Goal
The source-of-truth documentation defines one implementable MVP contract for feedback eligibility, consent, lifecycle ownership, processing states, and error handling without leaving lifecycle or processing-state choices to downstream tickets.
