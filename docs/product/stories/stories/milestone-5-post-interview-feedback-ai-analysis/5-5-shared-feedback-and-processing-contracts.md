# Story 5.5: Shared Feedback and Processing Contracts

**Milestone**: Milestone 5: Post-Interview Feedback & AI Analysis
**Description**: Replace freeform feedback data with strict shared schemas and expose typed processing state to backend and frontend consumers.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/db-schemas.md`
- `docs/product/stories/stories/milestone-5-post-interview-feedback-ai-analysis/5-4-feedback-and-artifact-schema-migration.md`

## What Needs to Be Done

### 1. Define the strict feedback v1 schema
- [ ] Add a strict `interviewFeedbackV1Schema` in `packages/shared/src/interviews.ts` with `schema_version: 1`, integer 0-100 scores, bounded summaries, and no unknown keys.
- [ ] Define fixed `communication`, `problem_solving`, and `technical_depth` dimension objects, each containing a score and bounded evidence-grounded summary.
- [ ] Define bounded strengths and improvements arrays; each strength requires `title` and `evidence`, and each improvement requires `title`, `evidence`, and an actionable `action`.
- [ ] Export inferred feedback types through `packages/shared/src/index.ts`.

### 2. Define processing and report fields
- [ ] Add shared schemas/types for recording status, feedback status, feedback unavailable reasons, per-kind artifact availability, safe feedback error codes, transcript, feedback prompt version, and generated timestamp.
- [ ] Keep the database persistence-row feedback field tolerant of legacy unknown JSON, but validate/map it to the strict versioned union only at ready-persistence and client-detail boundaries.
- [ ] Extend `interviewDetailSchema` with participant-visible transcript and processing fields while preserving their exclusion from `interviewListItemSchema`.
- [ ] Keep browser-facing `recording_url` and `screenshot_urls` as participant-authorized application URLs; do not add object keys to shared client contracts.
- [ ] Add the narrow participant-only feedback-status response schema containing status, unavailable reason, safe error code, schema/prompt version, and updated timestamp without transcript or feedback prose.

### 3. Add shared contract coverage
- [ ] Add tests accepting a complete feedback v1 payload and rejecting unknown keys, missing evidence, out-of-range scores, excessive arrays, and unsupported schema versions.
- [ ] Add tests proving list responses omit transcript/artifact/feedback fields and detail responses parse each processing state safely.
- [ ] Add compatibility tests proving freeform legacy database JSON does not crash row parsing and is never emitted as ready v1 feedback.
- [ ] Add compile-time/type-level usage coverage for frontend and backend imports.

## Implementation Notes
- Keep model name, raw provider response, token usage, system prompt, and provider error text outside the client feedback object.
- Interview-type-specific prompt weighting may vary, but the MVP response shape remains stable so the report UI is deterministic.

## End Goal
Every application consumes one strict and versioned feedback/report contract instead of accepting arbitrary JSON from the analysis provider.
