# AI Feedback Pipeline

**Last reconciled**: 2026-08-07 (Milestone 5 Contract Lock)

The AI feedback pipeline is a multi-stage process triggered upon the first successful interview lifecycle completion (`ongoing -> completed`). It produces a strict, versioned feedback report stored alongside the interview row.

## 1. Feedback Eligibility and Lifecycle Ownership

- **Source event**: The first successful `ongoing -> completed` transition (via `POST /api/interviews/:id/end` or workflow timer timeout) is the only event that triggers feedback processing. Subsequent idempotent `end` retries do not re-trigger feedback.
- **Recording consent precondition**:
  - AI-led sessions require the candidate's consent.
  - Peer-to-peer sessions require both participants' consent.
  - Declining consent does not block the interview but makes automated feedback unavailable (`feedback_status = 'not_started'`, `feedback_unavailable_reason = 'no_consent'`).
- **Workflow ownership**: Timer orchestration remains in `InterviewLifecycleWorkflow`. A separate `InterviewFeedbackWorkflow` runs in the same notification-orchestrator Worker so timer failures and AI-analysis failures have independent retry domains.
- **Regeneration path**: Operational replay is the only MVP regeneration path. User-triggered regeneration and automatic processing of historical interviews are not supported.
- **Participant-attributed transcription inputs**:
  - AI-led sessions require a candidate-specific audio track.
  - Peer-to-peer sessions require participant-separated RealtimeKit audio tracks mapped to scheduler/interviewer roles before they are eligible for scored feedback.
  - Composite audio is playback-only and not used for transcription or analysis.

## 2. Processing and Report State Contracts

### 2.1 Transcript Persistence

- Transcripts are persisted in dedicated transcript storage (`interview_transcription_chunks`), not embedded as text inside `interviews.feedback`.
- The `feedback` column on `interviews` stores the structured feedback report JSON (versioned `schema_version: 1`) for new feedback. DB persistence tolerates legacy freeform JSON during the compatibility window; client-facing contracts validate/map to the strict versioned feedback v1 schema only at ready-persistence and client-detail boundaries (see `docs/system/system-design/db-schemas.md`).

### 2.2 Feedback Status Values and Transitions

`feedback_status` on the `interviews` table has five values:

| Status | Meaning |
|---|---|
| `not_started` | Feedback has not been initiated. Interview may be ineligible (no consent, no recording, unsupported format). |
| `pending` | Feedback processing is queued but not yet started. |
| `processing` | Feedback pipeline is actively running (transcription, analysis, or persistence). |
| `ready` | Feedback report has been generated and persisted successfully. |
| `failed` | Feedback processing encountered an unrecoverable error. |

Transition rules:
- `not_started -> pending`: Eligibility confirmed at completion time.
- `pending -> processing`: Pipeline picks up the work item.
- `processing -> ready`: All stages succeeded; feedback JSON persisted.
- `processing -> failed`: Infrastructure or inference error; `feedback_error_code` set.
- `processing -> not_started`: Unsupported track format/mapping discovered after claim; `feedback_unavailable_reason` set.
- `failed -> pending`: Operational replay re-queues the attempt.
- `ready` is terminal unless operational replay overrides.

### 2.3 Feedback Unavailable Reasons (`not_started` state)

When `feedback_status = 'not_started'`, a `feedback_unavailable_reason` explains why:

| Reason | Meaning |
|---|---|
| `no_consent` | One or more required participants declined recording consent. |
| `no_recording` | No recording was created for this interview. |
| `unsupported_format` | Track format or participant mapping is not supported for transcription. |

These are safe client-facing values. They do not expose provider messages or internal diagnostics.

### 2.4 Feedback Error Codes (`failed` state)

When `feedback_status = 'failed'`, a `feedback_error_code` explains the failure:

| Error Code | Meaning |
|---|---|
| `assets_not_ready` | Recording or screenshot artifacts were not finalized in time. |
| `transcription_failed` | Workers AI transcription returned an error or produced no usable output. |
| `analysis_failed` | AI Gateway analysis request failed or returned an unusable response. |
| `invalid_feedback` | Analysis output did not conform to the strict feedback v1 schema. |
| `internal_error` | Unexpected internal error during processing. |

These are safe client-facing error codes. Provider error bodies, raw model responses, and token usage are never persisted or returned to clients.

### 2.5 Unavailable Transition Matrix

| Scenario | From | To | Reason/Error Set |
|---|---|---|---|
| Completion-time ineligibility (no consent, no recording) | — | `not_started` | `feedback_unavailable_reason` |
| Unsupported track format discovered after claim | `processing` | `not_started` | `feedback_unavailable_reason = 'unsupported_format'` |
| Infrastructure or inference exhaustion | `processing` | `failed` | `feedback_error_code` |
| Successful completion | `processing` | `ready` | None |

## 3. Pipeline Stages

1. **Eligibility Check**: At completion, verify consent and recording availability. If ineligible, set `not_started` with reason.
2. **Recording Finalization**: Wait for RealtimeKit recording finalization webhook (`POST /api/webhooks/realtimekit`). Composite and participant tracks are persisted as separate `interview_recordings` rows.
3. **Artifact Storage**: Recording files and whiteboard screenshots are stored in private R2 with deterministic object-key prefixes under `interviews/{interview_id}/`.
4. **Transcription**: Workers AI transcribes participant-attributed audio tracks. Transcript chunks are persisted to `interview_transcription_chunks` so retries do not retranscribe completed chunks.
5. **Analysis**: A Cloudflare Workflow sends the aggregated context (transcript, screenshots, metadata) to the AI Gateway, which prompts a high-reasoning LLM to evaluate the candidate.
6. **Persistence**: The resulting JSON feedback is validated against the strict feedback v1 schema and saved to `interviews.feedback`. `feedback_status` transitions to `ready`.
7. **Notification**: The user is notified via the app or email that feedback is available.

## 4. RealtimeKit Recording Integration

- RealtimeKit server-controlled composite recording plus participant-separated audio tracks.
- Maximum recording duration: 3,600 seconds (60 minutes).
- Recording status is verified via a public-key-verified status webhook (`POST /api/webhooks/realtimekit`).
- Browser-composed full-session recordings are not uploaded.
- The composite playback job and every required participant-track job are persisted separately in `interview_recordings`.
- Aggregate `interviews.recording_status` is derived only after evaluating all required recording rows/artifacts.

## 5. Feedback Report Data Contract (v1)

The feedback report is a strict, versioned JSON object. The `schema_version` field is required and must be `1` for the current MVP.

### Report Shape

```
{
  "schema_version": 1,
  "overall_score": <integer 0-100>,
  "summary": <string, bounded>,
  "dimensions": {
    "communication": {
      "score": <integer 0-100>,
      "summary": <string, bounded>
    },
    "problem_solving": {
      "score": <integer 0-100>,
      "summary": <string, bounded>
    },
    "technical_depth": {
      "score": <integer 0-100>,
      "summary": <string, bounded>
    }
  },
  "strengths": [
    {
      "title": <string>,
      "evidence": <string>
    }
  ],
  "improvements": [
    {
      "title": <string>,
      "evidence": <string>,
      "action": <string>
    }
  ]
}
```

### Field Rules

- `schema_version`: Must be `1`. Unknown schema versions are rejected.
- `overall_score`: Integer 0-100 inclusive.
- `summary`: Bounded string. Concise overall assessment.
- `dimensions`: Exactly three fixed dimensions: `communication`, `problem_solving`, `technical_depth`. Each has a `score` (integer 0-100) and `summary` (bounded, evidence-grounded string).
- `strengths`: Array of objects. Each requires `title` and `evidence`. Evidence must reference specific moments from the transcript or session.
- `improvements`: Array of objects. Each requires `title`, `evidence`, and `action`. `action` is an actionable recommendation.
- No unknown keys are permitted. The schema is strict.
- Provider/model identifiers, raw provider responses, token usage, system prompts, and provider error text are not included in the client feedback object.
- Interview-type-specific prompt weighting may vary, but the response shape remains stable so the report UI is deterministic.
