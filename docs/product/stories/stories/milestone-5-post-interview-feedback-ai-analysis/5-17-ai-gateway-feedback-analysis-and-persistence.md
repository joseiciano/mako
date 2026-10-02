# Story 5.17: AI Gateway Feedback Analysis and Persistence

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Analyze transcript and whiteboard evidence through AI Gateway, validate strict feedback v1 output, and persist one complete report.
**Status**: Completed
**Prerequisites**:
- `docs/system/system-design/ai-feedback-pipeline.md`
- `docs/infrastructure/backend.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-5-shared-feedback-and-processing-contracts.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-16-workers-ai-recording-transcription.md`

## What Needs to Be Done

### 1. Build bounded evidence context
- [x] Load the persisted transcript plus interview type, mode, tier, difficulty/policy metadata, and candidate alias from canonical Postgres state.
- [x] Load a deterministic bounded set of finalized screenshot objects from private R2 in capture order; an empty finalized screenshot array is valid.
- [x] Enforce context size and screenshot count/byte limits before calling the provider, with deterministic truncation that preserves transcript beginning/end and records a safe truncation metric.
- [x] Treat transcript and image content as untrusted evidence that cannot override system instructions or response schema.

### 2. Add a versioned feedback prompt and AI Gateway adapter
- [x] Add a versioned post-interview system prompt under the backend feedback module for system-design interview coaching rather than pass/fail hiring decisions.
- [x] Require evidence-grounded scoring for overall performance, communication, problem solving, and technical depth, plus specific strengths and improvement actions.
- [x] Pin one server-selected high-reasoning model that supports image inputs and structured JSON, then send requests through configured Cloudflare AI Gateway with timeouts and bounded retries.
- [x] Add a configuration-readiness test that submits transcript text plus a non-sensitive PNG fixture; do not silently drop screenshot evidence if the configured model lacks vision support.
- [x] Request structured JSON output where supported and parse the final response with `interviewFeedbackV1Schema` regardless of provider guarantees.

### 3. Persist one validated report
- [x] Reject malformed, partial, unsupported-version, out-of-range, or unknown-key responses without writing `interviews.feedback`.
- [x] Persist the complete feedback object, prompt version, generated timestamp, clear error code, and transition `processing -> ready` in one conditional update fenced by the active feedback attempt ID.
- [x] Make duplicate persistence a safe no-op and never overwrite an already-ready v1 report during automatic retries.
- [x] Do not persist raw model responses, hidden reasoning, system prompts, or provider error bodies.

### 4. Add analysis coverage
- [x] Add tests for prompt/context assembly, deterministic screenshot selection, empty screenshots, context truncation, and prompt-injection-like transcript text.
- [x] Add mocked AI Gateway tests for valid output, invalid JSON, schema-invalid output, timeout, retryable provider errors, and terminal errors.
- [x] Add repository tests for attempt-fenced conditional ready persistence and protection against stale, partial, or duplicate writes.

## Implementation Notes
- The output is learning-oriented feedback, not an employment decision. Avoid recommendation fields such as hire/no-hire.
- Screenshot analysis is optional evidence; a missing required recording/transcript remains a terminal processing problem for MVP.

## End Goal
Eligible interviews produce one schema-valid, evidence-grounded feedback v1 report through AI Gateway with deterministic inputs and atomic persistence.
