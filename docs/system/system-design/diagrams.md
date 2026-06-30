### Realtime Interview 

**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

Refer to `../diagrams/realtime_interview.md`

Flow is as follows:
1. **Scheduling & Post-Commit Orchestration:** The Backend API Worker (Hono) schedules the interview and commits lifecycle state in Postgres.
2. **Queue Hand-off (Post-Commit):** After commit, lifecycle events are emitted to Cloudflare Queues for async notification/reminder orchestration.
3. **Session Provisioning (Join-Time Route):** At the scheduled time, the user navigates to the interview page and clicks the "Join" button (`POST /api/interviews/:id/provision`). The Backend API Worker initializes and provisions Cloudflare Realtime resources in this route boundary.
4. **Session Start (Lifecycle Route):** Participant explicitly starts live session via `POST /api/interviews/:id/start`, transitioning interview state from `scheduled` to `ongoing` when valid.
5. **Lifecycle Orchestration:** Follow-up workflow work observes successful `start` as the persisted boundary for managing the interview timer (60 minutes).
6. **Client Connection:** The Frontend (TanStack Start) connects to the Realtime session via the RealtimeKit SDK for live audio/video/data streaming.
7. **In-Session Events:** Follow-up workflow/runtime work sends timer events (e.g., 5-minute warnings) via Realtime to clients.
8. **Session Termination:** Manual completion via `POST /api/interviews/:id/end` persists `completed`; follow-up timer expiration and Realtime session locking must converge on the same terminal state.
9. **Data Persistence & Feedback:**
   - Session recordings and screenshots are persisted to Cloudflare R2.
   - AI Feedback is generated using Cloudflare AI Gateway and LLM providers.
10. **Collaboration Tools**:
   - For system design interviews, a **shared Excalidraw live collaboration session** is provisioned. Participants join using the persisted `excalidraw_room_id` and `excalidraw_key` returned by `POST /api/interviews/:id/provision`.
   - For peer-to-peer interviews, both users join the same interview-scoped room/key pair.
   - For AI-led interviews, the user gets a single interview-scoped room/key pair (no second human participant).
   - Whiteboard state synchronization is handled efficiently over **Cloudflare Realtime**, ensuring a low-latency collaborative experience without manual "streaming" of the canvas.
   - For AI-led guidance, the backend sends Excalidraw scene JSON snapshots (or a normalized derivative) with chat context/rubric prompts to the LLM.
   - Mermaid can be produced as an optional derived artifact for reporting/export, but Excalidraw scene data remains the source-of-truth payload for AI guidance.
   - If Excalidraw MCP is used for AI interviewer behavior, MCP access must be explicitly joined with the interview's room credentials; it does not gain implicit/global read access to sessions.

Cancellation transition behavior (must stay aligned with `state-management-lifecycle.md`):
- `scheduled -> cancelled`: allowed
- `cancelled -> cancelled`: idempotent success (unchanged state)
- `ongoing|completed -> cancelled`: rejected invalid transition

Provisioning note: join-time provisioning is a runtime route phase (`POST /api/interviews/:id/provision`), not a persisted interview `status` value.
Provisioning should be idempotent for reconnect/retry behavior within the same active interview so room/key/session values are reused rather than regenerated.
Lifecycle note: workflow timer ownership is follow-up work anchored to successful `POST /api/interviews/:id/start`; manual `POST /api/interviews/:id/end` must converge safely with future workflow timeout completion.

### Creating account/updating 

Refer to `../diagrams/crud.md`

Key account flows include:
1. **Authentication:** Managed via **Better Auth** and persisted in the Neon Postgres database.
- **Session Management**: We use **HTTP-only, Secure cookies** for session management. This ensures that session tokens are not accessible via client-side JavaScript, mitigating XSS risks.
- **CSRF Protection**: Better Auth provides built-in CSRF protection for session-based authentication.
- **Persistence**: Sessions are persisted in the Neon Postgres database, allowing for features like "Sign out from all devices".

2. **Profile Management:** Standard RESTful operations (GET/PATCH/DELETE) handled by Hono workers with soft-deletion support.
3. **Credit System:** A "pay-per-credit" model using **Stripe Elements** for checkout. Fulfillment is handled asynchronously via Stripe Webhooks (`payment_intent.succeeded`) to update user balances in Postgres.
4. **Interviewer Onboarding:** A registration flow where users submit employment history, leading to a "Pending" state until an internal review (manual or AI-assisted) updates their interviewer status and triggers a notification via an email service (e.g., Resend).
