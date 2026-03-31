### Realtime Interview 

**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

Refer to `./diagrams/realtime_interview.md`

Flow is as follows:
1. **Scheduling & Post-Commit Orchestration:** The Backend API Worker (Hono) schedules the interview and commits lifecycle state in Postgres.
2. **Queue Hand-off (Post-Commit):** After commit, lifecycle events are emitted to Cloudflare Queues for async notification/reminder orchestration.
3. **Session Provisioning (Join-Time Route):** At the scheduled time, the user navigates to the interview page and clicks the "Join" button (`POST /api/interviews/:id/provision`). The Backend API Worker initializes and provisions Cloudflare Realtime resources in this route boundary.
4. **Lifecycle Orchestration:** A Cloudflare Workflow is triggered to manage the interview timer (60 minutes).
5. **Client Connection:** The Frontend (TanStack Start) connects to the Realtime session via the RealtimeKit SDK for live audio/video/data streaming.
6. **In-Session Events:** During the interview, Cloudflare Workflows sends events (e.g., 5-minute warnings) via Realtime to the clients.
7. **Session Termination:** Upon timer expiration or manual completion, the Workflow locks the Realtime session and triggers the post-interview process.
8. **Data Persistence & Feedback:** 
   - Session recordings and screenshots are persisted to Cloudflare R2.
   - AI Feedback is generated using Cloudflare AI Gateway and LLM providers.
9. **Collaboration Tools**:
   - For system design interviews, a **shared Excalidraw collaboration session** is provisioned. Both participants join this session using a unique Room ID and Encryption Key.
   - Whiteboard state synchronization is handled efficiently over **Cloudflare Realtime**, ensuring a low-latency collaborative experience without manual "streaming" of the canvas.
   - For AI-led interviews, the AI interviewer utilizes the **Excalidraw MCP** (Model Context Protocol) to join the session, allowing it to "see" and interact with the whiteboard state in real-time.

Cancellation transition behavior (must stay aligned with `state-management-lifecycle.md`):
- `scheduled -> cancelled`: allowed
- `cancelled -> cancelled`: idempotent success (unchanged state)
- `provisioning|ongoing|completed -> cancelled`: rejected invalid transition

### Creating account/updating 

Refer to `./diagrams/crud.md`

Key account flows include:
1. **Authentication:** Managed via **Better Auth** and persisted in the Neon Postgres database.
- **Session Management**: We use **HTTP-only, Secure cookies** for session management. This ensures that session tokens are not accessible via client-side JavaScript, mitigating XSS risks.
- **CSRF Protection**: Better Auth provides built-in CSRF protection for session-based authentication.
- **Persistence**: Sessions are persisted in the Neon Postgres database, allowing for features like "Sign out from all devices".

2. **Profile Management:** Standard RESTful operations (GET/PATCH/DELETE) handled by Hono workers with soft-deletion support.
3. **Credit System:** A "pay-per-credit" model using **Stripe Elements** for checkout. Fulfillment is handled asynchronously via Stripe Webhooks (`payment_intent.succeeded`) to update user balances in Postgres.
4. **Interviewer Onboarding:** A registration flow where users submit employment history, leading to a "Pending" state until an internal review (manual or AI-assisted) updates their interviewer status and triggers a notification via an email service (e.g., Resend).
