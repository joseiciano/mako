# Story 5.16: Workers AI Recording Transcription

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Transcribe finalized private recordings with Cloudflare Workers AI Whisper and persist participant-visible transcript text idempotently.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/ai-feedback-pipeline.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-11-realtimekit-recording-finalization-webhook.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-10-feedback-workflow-definition-and-trigger.md`

## What Needs to Be Done

### 1. Add a Workers AI transcription adapter
- [x] Add a dependency-injected transcription repository/service under `packages/shared-backend/src/interview-feedback/` using the notification-orchestrator `AI` binding.
- [x] Configure the documented Cloudflare-hosted Whisper model server-side and validate its response before use.
- [x] Set the task to transcription and apply conservative voice-activity/no-speech handling suitable for interview recordings.
- [x] Keep model choice, language defaults, and transcription options in versioned server configuration.

### 2. Process recording input safely
- [x] For AI-led sessions, require the finalized candidate-specific track; for peer-to-peer sessions, require finalized participant-separated tracks mapped to scheduler/interviewer roles. Composite output is playback-only.
- [x] Verify each referenced R2 object exists with its expected allowlisted content type before inference.
- [x] Use the documented Workers AI long-audio pattern to range-read deterministic bounded chunks, Base64-encode only one chunk at a time, and submit sequentially without buffering a full one-hour file.
- [x] Verify the production RealtimeKit audio formats with 60-minute non-sensitive fixtures. If participant-track WebM is not accepted by Workers AI, keep peer-to-peer feedback ineligible with a safe unsupported-format reason until a separately approved conversion path exists.
- [x] Apply the same safe unavailable behavior when an AI-led candidate track cannot be produced, mapped, or submitted in a supported format.
- [x] Reject empty/near-silent output and surface safe `transcription_failed` behavior after bounded retries.
- [x] Never send screenshots, user identifiers, or unrelated interview records to the transcription model.

### 3. Persist transcript idempotently
- [x] Persist each successful chunk under the current feedback attempt and participant role; retries must reuse completed chunks instead of restarting the full recording.
- [x] Normalize chunk output into one bounded, chronologically ordered, role-labelled transcript while avoiding duplicated overlap text.
- [x] Persist final transcript text only when the interview is still `processing`, attempt ID matches, and transcript is null; retries reuse an existing transcript.
- [x] Do not embed transcript in `feedback` or workflow/queue payloads.

### 4. Add transcription coverage
- [x] Add adapter tests for successful response parsing, invalid provider responses, timeout/retry behavior, and silent audio.
- [x] Add service tests for missing/not-ready audio, role attribution, deterministic chunk assembly, chunk checkpoint reuse, attempt fencing, and existing-transcript reuse.
- [x] Add a representative integration fixture that exercises the chosen production recording format without committing sensitive real interview audio.

## Implementation Notes
- Composite mixed audio is not sufficient for peer-to-peer scoring. Do not infer speaker roles from conversation text.
- Editable transcripts, translations, subtitles, and word-level confidence are outside MVP scope.

## End Goal
The feedback workflow can turn finalized, role-mapped private audio artifacts into a validated, durable transcript without duplicate inference or leakage into transport payloads.
