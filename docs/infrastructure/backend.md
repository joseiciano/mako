# Backend Infrastructure

This document goes over all the tools we will be using for our backend services

**Last reconciled**: 2026-08-17

- **Cloudflare Workers**: Cloudflare workers for the main hosting environment of the backend service. Routes are defined via a singular API worker. [Docs](https://developers.cloudflare.com/api/resources/workers/)
- **Cloudflare Hyperdrive**: We use hyperdrive to speak to our Postgres database instance from Cloudflare Workers. [Docs](https://developers.cloudflare.com/api/resources/hyperdrive/)
- **Cloudflare Realtime**: We will be using Cloudflare Realtime to serve our web streaming. [Docs](https://developers.cloudflare.com/api/resources/realtime_kit/)
**Note**: We will **ALWAYS** be using **Cloudflare RealtimeKit,** **NEVER** use Cloudflare Calls. It is outdated. 
  - Backend room provisioning requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_REALTIMEKIT_APP_ID` for the `POST /api/interviews/:id/provision` route.
- **Cloudflare Workflows**: We use Workflows to orchestrate the interview lifecycle. This handles the 60-minute interview timer, emits structured `timer_warning`/`timer_completed` logs, and converges on a guarded lifecycle transition upon completion. Realtime warning delivery, session locking, and AI feedback generation are future scope. [Docs](https://developers.cloudflare.com/api/resources/workflows/)
- **Feedback Workflow (InterviewFeedbackWorkflow)**: A dedicated Cloudflare Workflow for post-interview feedback processing that runs in the notification-orchestrator Worker alongside the existing `InterviewLifecycleWorkflow`. It is triggered idempotently from `interview.completed` queue events with a deterministic instance ID `feedback-v1-{interview_id}`, so duplicate events never spawn duplicate feedback runs. It is provisioned for future transcription/analysis steps (Stories 5.16/5.17); the Workers AI binding is configured but not yet invoked; the AI Gateway will be wired in a future story.
- **Recording Finalization Workflow (RecordingFinalizationWorkflow)**: A dedicated notification-orchestrator Workflow triggered by signed RealtimeKit `UPLOADED` events. It refreshes provider state by recording ID, streams composite playback and participant tracks into private R2, persists artifact rows, and derives interview recording readiness only after required objects are visible. Workflow instances use `recording-finalize-v1-{provider_recording_id}-{attempt}`; scheduled sweeps retry bounded accepted/failed checkpoints.
- **Cloudflare Queues**: We use Queues for post-commit hand-off between workers (for example: matcher/API emitted orchestration events consumed by downstream notification/orchestration workers). Realtime session provisioning remains join-time route behavior (`POST /api/interviews/:id/provision`) rather than queue-triggered behavior. [Docs](https://developers.cloudflare.com/queues/)
- **Cron Triggers (Workers Schedules)**: We use cron-triggered workers for background scheduling jobs (for example: the Greedy Matcher worker). [Docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- **Durable Outbox Pattern**: Interview lifecycle events are persisted to a `notification_outbox_events` table within the same database transaction as the source write (interview create/cancel/match/completed/premium-booked). A separate dispatch step (post-commit or scheduled sweep) publishes these events to the queue, ensuring committed events are never silently lost even if the queue is temporarily unavailable.
- **Notification Orchestrator Worker**: A dedicated queue consumer worker that processes `interview.created`, `interview.cancelled`, `interview.match.created`, `interview.completed`, `interview.premium_booked`, and `reminder.due` events with durable idempotency via Postgres-backed checkpoints. It also runs on a scheduled cron to dispatch pending outbox events and enqueue due reminders. Per-effect checkpoints:
  - `interview.created` — `interview.created:confirmation` and `interview.created:reminder`
  - `interview.match.created` — `interview.match.created:confirmation` and `interview.match.created:reminder`
  - `interview.premium_booked` — `interview.premium_booked:confirmation` (to both participants) and `interview.premium_booked:reminder` (30-minute lead before `scheduled_at`, only when `status = 'scheduled'`)
  - `interview.cancelled` — `interview.cancelled:suppression` (applies to all booking channels including premium verified-interviewer bookings)
  - `reminder.due` — `reminder.due:{idempotency_key}`
  The `interview.premium_booked` outbox event uses the deterministic idempotency key `premium-booking:{interview_id}`.
- **Cloudflare R2**: These will save the recording/any screenshots we take. [Docs](https://developers.cloudflare.com/api/resources/r2/)
  - **Bucket bindings**: `RECORDINGS_BUCKET` (bucket: `mako-recordings`) and `SCREENSHOTS_BUCKET` (bucket: `mako-screenshots`).
  - Both buckets are configured in `wrangler.jsonc` for both `apps/backend-rest` and `apps/notification-orchestrator`.
  - All artifact buckets have a 30-day lifecycle expiration.
  - Buckets are private by default — public URL access must stay disabled.
  - **Key prefix conventions**: `interviews/{interviewId}/recording/{recordingId}` and `interviews/{interviewId}/screenshots/{screenshotId}`.
- **Local Workflow Development**: Cloudflare Workflows (`SessionTimerWorkflow` in `backend-rest`, `InterviewFeedbackWorkflow` and `RecordingFinalizationWorkflow` in `notification-orchestrator`) can be tested locally via `wrangler dev`. Required bindings for local workflow runs:
  - `HYPERDRIVE` — local Postgres connection string (set in `.dev.vars` or via `wrangler.jsonc` local config)
  - `NOTIFICATION_QUEUE` — local queue binding (configured in `wrangler.jsonc`)
   - `RECORDINGS_BUCKET` / `SCREENSHOTS_BUCKET` — local R2 buckets (configured via `wrangler r2 bucket create` for local dev)
   - `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_REALTIMEKIT_APP_ID` — RealtimeKit recording status API credentials
   - `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL` — well-known URL for webhook signature verification, configured as a `vars` binding in `backend-rest/wrangler.jsonc`
  - `AI` — Workers AI binding (for feedback workflow; configured in `notification-orchestrator/wrangler.jsonc`)
  See `docs/system/local-testing.md` for the general local test stack setup.
- **Cloudflare AI Gateway**: We will interact with our AI providers through Cloudflare's AI Gateway service [Docs](https://developers.cloudflare.com/api/resources/ai_gateway/)
- **Stripe**: We use Stripe to handle payments and the pay-per-credit system for scheduling interviews. We will use Stripe Checkout for purchases and webhooks to fulfill credits in our database. [Docs](https://docs.stripe.com/api)

- **Hono**: Hono for defining the routes within the cloudflare worker. As it was built to support workers, this is a very useful tool. [Docs](https://hono.dev/docs/api/hono)
- **Postgres**: We will use a postgres database to handle our data collection. This postgres instance is hosted on [Neon](https://neon.com/docs/introduction). [Docs](https://neon.com/docs/introduction)
- **Better Auth**: We will use better auth to handle authentication as well as email verification. It uses **HTTP-only cookies** for secure session management by default. [Docs](https://better-auth.com/docs/introduction)
- **Zod**: Zod is used for defining data schemas. This is to be used for things like API request shapes. [Docs](https://zod.dev/)
- **Zod / API documentation**: Every route is backed by shared, validated Zod schemas in `@mako/shared` used for request validation and response typing, documented exactly in `docs/system/system-design/api-routes.md` (request/response shapes, error states, cache/ordering semantics), and locked down by contract tests. **Generated OpenAPI/Swagger annotation tooling (for example `zod-openapi` / `hono-openapi`) is deferred to a separate repository-wide initiative**; individual feature tickets must not introduce partial annotation conventions (no ad-hoc `zod-to-openapi` decorators or bespoke OpenAPI metadata). When that tooling lands it will be adopted uniformly across the codebase. [Docs](https://hono.dev/examples/zod-openapi)
- **Excalidraw MCP**: Used by the AI interviewer to interact with and analyze explicitly joined whiteboard sessions; MCP access requires interview room credentials and must not assume implicit/global access to Excalidraw sessions.


**NOTE**: We are speaking to our postgres database directly with SQL queries, speaking to it with Cloudflare Hyperdrive. We are not, and never will be using an orm. Never recommend an orm, never use an orm, never mention an orm. 

## Environment Variables & Secrets

The backend worker reads the following secrets from Cloudflare Workers bindings (set via `wrangler secret put` or `.dev.vars` for local development). CI/CD deployment secrets are managed via `./scripts/set-github-env-secrets.sh`.

### Stripe

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe API secret key (`sk_live_...` or `sk_test_...`). Used to initialize the Stripe SDK client for creating Payment Intents. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint signing secret (`whsec_...`). Used to verify the signature of incoming webhook events on `POST /api/payments/webhook`. |

**Local development**: add both values to `apps/backend-rest/.dev.vars`.

**Webhook endpoint**: register `https://api.mako.example.com/api/payments/webhook` in the Stripe Dashboard. For local testing, use the Stripe CLI to forward events (see `docs/system/local-testing.md`).

### Rate Limiters

Cloudflare Rate Limiting bindings configured in `apps/backend-rest/wrangler.jsonc` under `ratelimits`.

| Binding | Limit | Period (seconds) | Used by |
|---|---|---|---|
| `PREMIUM_MARKETPLACE_RATE_LIMITER` | 60 | 60 | `GET /api/premium/marketplace` public listing (Story 7.15). Requests over the limit receive `429 { error: 'RATE_LIMITED' }`. The limiter key is the raw `CF-Connecting-IP` plus a route key; the raw IP is **never** written to logs. When the binding is missing or the limiter rejects, the route passes through and emits a PII-safe `premium.marketplace.rate_limiter_fallback` log containing only a derived location hash, route key, and outcome. |

### AI Gateway

The backend worker communicates with Cloudflare Workers AI (or Cloudflare AI Gateway when configured) for AI-led interview chat responses. The responder is constructed in the interview service wiring and uses standard Cloudflare account credentials.

| Variable | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID. Used by the AI responder to construct the Workers AI REST endpoint URL. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers AI permissions. Used as the Bearer token for AI provider requests. |
| `AI_GATEWAY_BASE_URL` | Optional. AI Gateway base URL (e.g. `https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}`). When set, the responder derives the gateway ID from the last URL segment and sends it via the `cf-aig-gateway-id` header for observability and routing. When absent, the responder makes the direct Workers AI call without the header. Provisioned by Terraform as a `plain_text` binding when `ai_gateway_name` is set. |

**Local development**: add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to `apps/backend-rest/.dev.vars`. `AI_GATEWAY_BASE_URL` is optional for local dev; add it to `.dev.vars` only when testing AI Gateway routing, otherwise omit it to use the direct Workers AI endpoint.

**Binding flow**: `AI_GATEWAY_BASE_URL` is provisioned as a `plain_text` binding by Terraform (not a secret), so `wrangler.jsonc` intentionally does not declare this var. The backend-rest deploy step runs `wrangler deploy --keep-vars` so the existing Terraform-managed var is preserved and not removed by the deploy. If you deploy without Terraform, set the value via `wrangler vars put AI_GATEWAY_BASE_URL <url>`.

**Endpoint resolution**: The responder (`packages/shared-backend/src/interviews/ai-gateway-responder.ts`) always builds the Cloudflare REST endpoint at runtime:
- `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions`

The gateway ID is derived from `AI_GATEWAY_BASE_URL` by the `extractAiGatewayId` helper in `apps/backend-rest/src/index.ts` and sent via the `cf-aig-gateway-id` header. When no gateway ID is configured, the responder makes the direct Workers AI call without that header.

**Prompt versioning**: All AI chat responses include a `prompt_version` field (`system-design-review-v1` as of Story 4.6) for auditability. The prompt version constant and pure message/prompt builders live in `packages/shared-backend/src/interviews/ai-chat-prompt.ts`; the responder imports and re-exports the version so the previous export contract remains valid.

**Cache behavior**: AI requests include `cf-aig-skip-cache: true` and `cf-aig-request-timeout: 30000` headers because the canvas snapshot context is mutable and must not be served from cache.

**Error semantics**:
- Provider errors (non-OK upstream response, malformed JSON, empty reply) are mapped to HTTP 502.
- Missing credentials, network failures, and timeouts are mapped to HTTP 503.

### RealtimeKit Recording

RealtimeKit server-controlled recording is used for session capture. Recording is initiated and stopped via the RealtimeKit API with server-side control.

| Variable | Description |
|---|---|
| `CLOUDFLARE_REALTIMEKIT_APP_ID` | RealtimeKit application ID for recording API calls. Already used by provisioning. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for RealtimeKit API authentication. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with RealtimeKit permissions. |
| `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL` | Well-known URL for cached, refreshable public-key verification of RealtimeKit webhook signatures: `https://api.realtime.cloudflare.com/.well-known/webhooks.json`. Configured as a plain_text `vars` binding in `apps/backend-rest/wrangler.jsonc` (not a secret). |

**Recording behavior**:
- Composite recording plus participant-separated audio tracks. Composite output is playback-only as a single `playback_recording` artifact; participant tracks are persisted as `transcription_audio` artifacts. A single TRACK provider recording ID can return multiple participant files — the workflow iterates every `download_url[].download_urls` entry, parses the encoded `user_id` from the filename, validates it against the canonical interview scheduler/interviewer IDs, maps scheduler→`candidate` and peer interviewer→`interviewer`, and persists one `transcription_audio` artifact per file. AI-led sessions map the single candidate track; peer-to-peer sessions map each participant track to its role. Never use mixed composite audio for scoring.
- Maximum recording duration: 3,600 seconds (60 minutes).
- Recording status verified via raw-body public-key-verified webhook (`POST /api/webhooks/realtimekit`). The handler reads raw request bytes and verifies the Base64 RSA-SHA256 `rtk-signature` using a cached, refreshable public key fetched from `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL` before parsing JSON. `rtk-uuid` provides duplicate-delivery safety via `realtimekit_webhook_events.provider_event_id`.
- Provider state mapping to `realtimekit_webhook_events.status` without regression: `INVOKED`/`RECORDING` → `accepted`, `UPLOADING` → `finalizing`, `UPLOADED` → `processed`, `ERRORED` → `failed`. Out-of-order and repeated states are idempotent no-ops with diagnostics preserved. Resolution is by persisted provider recording ID, not by interview/user identifiers in the payload.
- Fast acknowledgement: in one short transaction the webhook persists the accepted event/checkpoint and provider state then returns `2xx`; media download never occurs in the webhook request. Unsupported but validly signed event types are acknowledged without side effects; only safe error codes are persisted for terminal failures.
- Deterministic finalization handoff: accepted `UPLOADED` events trigger a `RecordingFinalizationWorkflow` instance with deterministic ID `recording-finalization-v1-{provider-recording-id}` and payload `{ recording_id, schema_version: 1 }` via `RECORDING_FINALIZATION_WORKFLOW.createBatch`. Duplicate delivery reuses the deterministic instance without parallel copies. The existing `InterviewFeedbackWorkflow` remains for post-interview feedback; `RecordingFinalizationWorkflow` is the dedicated recording-finalization workflow bound to both `backend_api` (direct webhook handoff) and `notification_orchestrator` (scheduled sweep).
- Fresh short-lived URL lookup and streaming: the workflow fetches fresh recording/track status and short-lived download URLs from RealtimeKit by provider recording ID inside the workflow; signed URLs are never persisted to SQL, logs, workflow return values, or step state. Large media is streamed as `ReadableStream` directly to private `RECORDINGS_BUCKET` under canonical keys `interviews/{interviewId}/recording/{artifactUuid}` without materializing the full buffer in memory, validating HTTPS origin, response status, content type, participant/role mapping, and bounded metadata. Provider asset uniqueness is enforced durably so retries do not duplicate objects.
- Aggregate readiness and artifact rows: normalized `interview_artifacts` rows are persisted with finalization/expiry timestamps; each recording job finalizes independently and aggregate `ready` is derived only after every required candidate/participant track and playback object is visible in R2. One artifact row per finalized provider asset.
- Bounded sweep recovery: a scheduled trigger (`*/5 * * * *`) in the notification-orchestrator sweeps bounded `accepted`/`failed` checkpoints by `UPLOADED` recording ID, reuses the same deterministic workflow IDs, restarts terminal skipped instances, and re-invokes `RecordingFinalizationWorkflow` for retry-safe recovery. Recording transfer is not delegated to `InterviewFeedbackWorkflow` and `FEEDBACK_WORKFLOW` is never used for recording finalization.
- Browser-composed full-session recordings are not uploaded.

### Private R2 Storage

R2 stores recordings, transcription audio, and whiteboard screenshots as private objects. Object keys use deterministic prefixes under `interviews/{interview_id}/` without user identifiers, aliases, emails, or original filenames.

| Variable | Description |
|---|---|
| `R2_BUCKET_NAME` | R2 bucket name for private artifact storage. |
| `R2_ACCOUNT_ID` | Cloudflare account ID for R2 access. |

**Access model**:
- Participant-authorized application routes are the only browser access path for recordings and screenshots.
- Raw object keys, provider download URLs, and public `r2.dev` URLs are never returned to clients.
- MVP retention: 30 days for raw recordings and screenshots. Transcript and feedback retained with interview until deletion.

**Account deletion**:
- `DELETE /api/account` (soft-delete) removes the shared interview's raw artifacts, transcript, and feedback for all participants when any recorded participant exercises deletion. No copy is retained under the counterpart's access.

### Workers AI Transcription

Workers AI is used for participant-attributed audio transcription. The transcription binding is configured on the backend worker.

| Variable | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for Workers AI. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers AI permissions. |

**Transcription behavior**:
- AI-led sessions require a candidate-specific audio track.
- Peer-to-peer sessions require participant-separated audio tracks mapped to scheduler/interviewer roles.
- Composite audio is playback-only and not transcribed.
- Transcript chunks are persisted to `interview_transcription_chunks` so retries do not retranscribe completed chunks.

### AI Gateway Feedback Analysis

The AI Gateway is used for feedback analysis (separate from AI chat). The analysis request sends aggregated context (transcript, screenshots, metadata) to a high-reasoning LLM via the AI Gateway.

| Variable | Description |
|---|---|
| `AI_GATEWAY_BASE_URL` | AI Gateway base URL for feedback analysis. Same binding as AI chat. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token. |

**Analysis behavior**:
- Provider/model identifiers remain server configuration. They are not client-selectable API fields.
- The response is validated against the strict feedback v1 schema before persistence.
- Model name, raw provider response, token usage, system prompt, and provider error text are not persisted in the client feedback object.
