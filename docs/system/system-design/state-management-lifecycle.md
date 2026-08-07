# Interview Lifecycle State Management

**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

The platform manages interview state across frontend and backend with explicit route/queue boundaries.

## 1. State ownership model

- **Frontend UI state**: managed via **TanStack Store**.
- **Frontend server state**: managed via **TanStack Query**.
- **Lifecycle source of truth**: Postgres interview row status transitions handled by backend routes/services.

## 2. Lifecycle states and progression

- **Scheduled (Peer-to-Peer or AI)**
  - Interview row exists in Postgres with `status = 'scheduled'`.
  - Notifications are sent after commit and reminder notifications are queued for delivery timing.
  - UI shows interview details and renders "Join" when user is eligible to start.

- **Join-time provisioning (runtime phase, not persisted interview status)**
  - Triggered by participant action on the join flow (`POST /api/interviews/:id/provision`).
  - Realtime/whiteboard session resources are initialized in this join-time route boundary.
  - `peer_to_peer`: both participants share one interview-scoped whiteboard room/key pair.
  - `ai_led`: a single-user interview-scoped whiteboard room/key pair is used.
  - Retry/reconnect behavior must be idempotent (reuse existing room/key/session values for the active interview).
  - This phase is **not** stored as a `status` value on the interview row.
  - This is **not** queue-triggered provisioning.
  - Session start/end/timer orchestration remains owned by lifecycle controls (Stories 3.8, 3.10, 3.11, and 3.12), not by whiteboard provisioning.

- **Ongoing**
  - Live audio/video/whiteboard state is synchronized via Cloudflare Realtime.
  - For AI-led sessions, chat guidance runs as runtime interaction (for example via `POST /api/interviews/:id/ai-chat`) and does not alter lifecycle status ownership.

- **Lifecycle control actions**
  - `POST /api/interviews/:id/start` is participant-only and is source-of-truth route boundary for `scheduled -> ongoing`.
  - Repeated `start` on already `ongoing` interview must be idempotent and return success semantics without conflicting state mutation.
  - `POST /api/interviews/:id/end` is participant-only and is source-of-truth route boundary for `ongoing -> completed`.
  - Repeated `end` on already `completed` interview must be idempotent and return success semantics without conflicting state mutation.
  - Invalid transitions must be rejected without state mutation (`cancelled -> start|end`, `completed -> start`, `scheduled -> end`).

- **Completion**
  - Triggered by participant `POST /api/interviews/:id/end` or workflow timer timeout; both converge to `completed` via atomic guarded transitions.
  - Interview status is updated to `completed`.

- **Cancelled**
  - Triggered by `POST /api/interviews/:id/cancel` when transition rules permit.

## 3. Cancellation transition matrix (source of truth)

| Current `status` | Cancel allowed? | Resulting status | Expected behavior |
| --- | --- | --- | --- |
| `scheduled` | Yes | `cancelled` | Atomic status update + `updated_at` mutation; post-commit cancel event emitted for notification suppression. |
| `cancelled` | Idempotent retry | `cancelled` (unchanged) | Return success semantics without additional state mutation. |
| `ongoing` | No | unchanged | Reject as invalid transition (session already live). |
| `completed` | No | unchanged | Reject as invalid transition (terminal complete state). |

Implementation requirement: invalid transitions must return explicit errors and must not mutate interview state.

## 4. Start/end transition matrix (source of truth)

| Current `status` | Action | Allowed? | Resulting status | Expected behavior |
| --- | --- | --- | --- | --- |
| `scheduled` | `start` | Yes | `ongoing` | Atomic status update; this persisted boundary is where active workflow timer orchestration hooks in. |
| `ongoing` | `start` | Idempotent retry | `ongoing` (unchanged) | Return success semantics without additional state mutation or duplicate lifecycle ownership. |
| `ongoing` | `end` | Yes | `completed` | Atomic terminal update; timer timeout completion converges on the same terminal state. |
| `completed` | `end` | Idempotent retry | `completed` (unchanged) | Return success semantics without additional state mutation. |
| `cancelled` | `start` or `end` | No | unchanged | Reject as invalid transition. |
| `completed` | `start` | No | unchanged | Reject as invalid transition. |
| `scheduled` | `end` | No | unchanged | Reject as invalid transition. |

Implementation requirement: repeated or concurrent lifecycle actions must converge to one deterministic persisted outcome.

## 5. Queue and workflow boundary

- Cloudflare Queues carry **post-commit lifecycle orchestration events** (e.g., create/cancel/match notifications).
- Queue consumers must be idempotent (at-least-once delivery assumption).
- Queue processing must not bypass route ownership of primary lifecycle state transitions.
- Cloudflare Workflow timer orchestration begins from the persisted `POST /api/interviews/:id/start` boundary, not from join provisioning, matcher workers, or client-only behavior.
- Timer continuity visible to clients must be sourced from backend/workflow state, not local-only countdown state.

## 6. Atomic guarded transitions and safe observability

- Lifecycle SQL writes use atomic guarded `UPDATE` statements with status conditions (`AND status = 'scheduled'` for start, `AND status = 'ongoing'` for end) and participant scope, eliminating `SELECT ... FOR UPDATE` dependency.
- If the guarded update returns no row, a safe participant-scoped `SELECT` (no lock) classifies the outcome as `not_found`, `already_ongoing`, `already_completed`, or `invalid_status`.
- Retryable transaction conflicts (`40001`, `40P01`) are retried with bounded attempts (max 3) after rollback.
- The `started_at_precondition` field on end transitions ensures that workflow timer completion and manual end converge correctly when `started_at` values diverge.
- Lifecycle observability events: `start_requested`, `start_succeeded`, `end_requested`, `end_succeeded`, `timer_warning`, `timer_completed`.
- All lifecycle log contexts are allowlisted (interview_id, participant_user_id, action, outcome, status, timer fields). Sensitive fields (`realtime_session_id`, `excalidraw_key`, `excalidraw_room_id`, `token`, cookies, auth headers) are never logged.

## 7. Feedback Lifecycle (Post-Completion)

Feedback processing is triggered by the first successful `ongoing -> completed` transition. It is owned by a separate `InterviewFeedbackWorkflow` in the notification-orchestrator Worker, independent from `InterviewLifecycleWorkflow` timer orchestration.

### Feedback Status States

- `not_started`: Default. Feedback has not been initiated or is ineligible.
- `pending`: Feedback processing queued.
- `processing`: Pipeline actively running.
- `ready`: Feedback report generated and persisted.
- `failed`: Unrecoverable error; `feedback_error_code` set.

### Feedback Trigger Boundary

- The first successful `ongoing -> completed` transition (via `POST /api/interviews/:id/end` or timer timeout) is the only source event for feedback processing.
- Idempotent `end` retries on an already-`completed` interview do not re-trigger feedback.
- Recording consent is checked at completion time. If consent is missing, `feedback_status` stays `not_started` with `feedback_unavailable_reason = 'no_consent'`.

### Retry Domain Separation

- Timer failures (workflow timeout, timer orchestration errors) are retried by `InterviewLifecycleWorkflow`.
- AI-analysis failures (transcription, analysis, persistence) are retried by `InterviewFeedbackWorkflow`.
- The two retry domains are independent: a timer failure does not block feedback processing and vice versa.

### Operational Replay

- Operational replay is the only MVP regeneration path for failed feedback.
- Replay is triggered by an operator (not by user action) and creates a new `feedback_attempt_id`.
- Historical interviews are not automatically processed.
