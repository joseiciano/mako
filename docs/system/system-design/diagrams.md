### Realtime Interview 

Refer to `./diagrams/realtime_interview.md`

Flow is as follows:
1. **Scheduling & Notification:** The Backend API Worker (Hono) schedules the interview, triggers an immediate confirmation email, and queues a reminder email for 30 minutes prior to the start time.
2. **Session Provisioning:** At the scheduled time, the user navigates to the interview page and clicks the "Join" button. The Backend API Worker then initializes the session and provisions a Cloudflare Realtime environment for live signaling and media.
3. **Lifecycle Orchestration:** A Cloudflare Workflow is triggered to manage the interview timer (60 minutes).
4. **Client Connection:** The Frontend (TanStack Start) connects to the Realtime session via the RealtimeKit SDK for live audio/video/data streaming.
5. **In-Session Events:** During the interview, Cloudflare Workflows sends events (e.g., 5-minute warnings) via Realtime to the clients.
6. **Session Termination:** Upon timer expiration or manual completion, the Workflow locks the Realtime session and triggers the post-interview process.
7. **Data Persistence & Feedback:** 
   - Session recordings and screenshots are persisted to Cloudflare R2.
   - AI Feedback is generated using Cloudflare AI Gateway and LLM providers.
8. **Collaboration Tools**:
   - For system design interviews, a **shared Excalidraw collaboration session** is provisioned. Both participants join this session using a unique Room ID and Encryption Key.
   - Whiteboard state synchronization is handled efficiently over **Cloudflare Realtime**, ensuring a low-latency collaborative experience without manual "streaming" of the canvas.
   - For AI-led interviews, the AI interviewer utilizes the **Excalidraw MCP** (Model Context Protocol) to join the session, allowing it to "see" and interact with the whiteboard state in real-time.

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
