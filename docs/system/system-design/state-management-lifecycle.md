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

- **Ongoing**
  - Live audio/video/whiteboard state is synchronized via Cloudflare Realtime.
  - For AI-led sessions, chat guidance runs as runtime interaction (for example via `POST /api/interviews/:id/ai-chat`) and does not alter lifecycle status ownership.

- **Completion**
  - Triggered by workflow timer/manual end.
  - Session is locked and interview status is updated to `completed`.

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

## 4. Queue and workflow boundary

- Cloudflare Queues carry **post-commit lifecycle orchestration events** (e.g., create/cancel/match notifications).
- Queue consumers must be idempotent (at-least-once delivery assumption).
- Queue processing must not bypass route ownership of primary lifecycle state transitions.
