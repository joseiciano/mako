# Backend Infrastructure

This document goes over all the tools we will be using for our backend services

**Last reconciled**: 2026-08-17

- **Cloudflare Workers**: Cloudflare workers for the main hosting environment of the backend service. Routes are defined via a singular API worker. [Docs](https://developers.cloudflare.com/api/resources/workers/)
- **Cloudflare Hyperdrive**: We use hyperdrive to speak to our Postgres database instance from Cloudflare Workers. [Docs](https://developers.cloudflare.com/api/resources/hyperdrive/)
- **Cloudflare Realtime**: We will be using Cloudflare Realtime to serve our web streaming. [Docs](https://developers.cloudflare.com/api/resources/realtime_kit/)
**Note**: We will **ALWAYS** be using **Cloudflare RealtimeKit,** **NEVER** use Cloudflare Calls. It is outdated. 
  - Backend room provisioning requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_REALTIMEKIT_APP_ID` for the `POST /api/interviews/:id/provision` route.
- **Cloudflare Email Service**: A native Worker `send_email` binding named `EMAIL` on the backend worker only. Cloudflare Email Service delivers Better Auth-generated verification links; no REST or SMTP email client, provider API token, Resend package, or notification-queue path exists for verification mail. [Docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
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
  - `EMAIL` — backend-rest-only `send_email` binding whose allowlist contains exactly the derived sender address (see *Email Service Infrastructure* below)
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

The backend worker reads secrets from Cloudflare Workers bindings (`wrangler secret put`) or `.dev.vars` locally. For deployed environments, copy `.env.staging.example` / `.env.production.example` to their gitignored counterparts and run `make envs-staging .env.staging` or `make envs-production .env.production`; these targets upload both GitHub secrets and non-secret variables.

### Email Service Infrastructure

`scripts/bootstrap.sh` owns the persistent Email Sending resources (the sending subdomain is created via the zone-scoped Email Service REST API with `preview_enabled: false` and `drop_suppressed_recipients: false`, followed by a 12-attempt readiness poll on every run). The backend Worker's `EMAIL` and `AUTH_EMAIL_FROM` bindings are owned by the committed `apps/backend-rest/wrangler.jsonc` and rendered by CI. Each environment must supply its own non-secret GitHub variables `EMAIL_SENDING_ZONE_ID` and `EMAIL_SENDING_DOMAIN`, and those zone, domain, token, and account values belong to that environment's Cloudflare account—staging must never reference production resources or vice versa.

Operator-supplied prerequisites before running `scripts/bootstrap.sh`:

- Cloudflare DNS is authoritative for the selected zone and the zone contains `EMAIL_SENDING_DOMAIN`.
- The CI token (`CLOUDFLARE_API_TOKEN`, not `CLOUDFLARE_RUNTIME_API_TOKEN`) has Email Sending edit permission in addition to its existing permissions.
- The environment's Cloudflare plan permits delivery to the intended recipients; until satisfied, restrict sending to controlled verified destinations.

Provisioned state (never duplicate these with ad-hoc DNS records or ad-hoc Wrangler bindings):

- One Email Sending subdomain per environment with `preview_enabled = false` and `drop_suppressed_recipients = false`. Readiness checks verify both values after provisioning because new domains enable previews by default.
- `AUTH_EMAIL_FROM = noreply@$EMAIL_SENDING_DOMAIN`, rendered by CI into the committed Wrangler config placeholder, exposed as a non-secret `plain_text` binding, and never uploaded as a secret.
- The `EMAIL` binding's `allowed_sender_addresses` allowlist contains exactly that derived sender.
- The backend Worker's observability sets `redact_query_string = true` so invocation telemetry cannot retain verification JWT query parameters. Wrangler 4.73.0 cannot express this setting in wrangler.jsonc, so `scripts/ensure-redact-query-string.sh` reasserts it via the Workers API after every backend deploy; readiness requires verifying the setting survives deployment (TEST-005).
- Cloudflare Email Service manages the domain's MX, SPF, DKIM, DMARC, and return-path records automatically.

After bootstrap, the readiness poll output reports `enabled` for the domain; re-running `scripts/bootstrap.sh` re-verifies it. `enabled = true` means Cloudflare reports the domain ready—it is not proof of mailbox delivery. Readiness evidence, a controlled staging send, and query-string-redaction preservation must pass before verification enforcement is promoted; see the Email Verification Deployment Gate in `docs/infrastructure/management.md`.

Application logs must never contain recipient addresses, verification URLs, tokens, message bodies, or raw provider error messages. Email Service necessarily retains its own provider-side delivery metadata; that boundary is documented in the operational monitoring section.

### Stripe

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe API secret key (`sk_live_...` or `sk_test_...`). Used to initialize the Stripe SDK client for creating Payment Intents. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint signing secret (`whsec_...`). Used to verify the signature of incoming webhook events on `POST /api/payments/webhook`. |

**Local development**: add both values to `apps/backend-rest/.dev.vars`.

**Staging optionality**: staging may omit both Stripe secrets until payment testing begins. The Worker still deploys and unrelated routes remain available; payment-client calls use a disabled fallback key, and the webhook endpoint returns `500 Webhook secret is not configured.` Production CI requires both values.

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
| `AI_GATEWAY_BASE_URL` | Optional. AI Gateway base URL (e.g. `https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}`). When set, the responder derives the gateway ID from the last URL segment and sends it via the `cf-aig-gateway-id` header for observability and routing. When absent, the responder makes the direct Workers AI call without the header. Not committed to `wrangler.jsonc`; no environment currently configures a gateway. |

**Local development**: add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to `apps/backend-rest/.dev.vars`. `AI_GATEWAY_BASE_URL` is optional for local dev; add it to `.dev.vars` only when testing AI Gateway routing, otherwise omit it to use the direct Workers AI endpoint.

**Binding flow**: `wrangler.jsonc` intentionally does not declare `AI_GATEWAY_BASE_URL`; the responder treats its absence as the supported direct-Workers-AI mode. If a gateway is ever adopted, add the literal gateway URL as a committed `plain_text` var in `wrangler.jsonc` (a static committed value, never a CI-rendered placeholder) — do not rely on out-of-band vars, because `wrangler deploy` without `--keep-vars` removes undeclared vars.

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

### Raw Artifact Retention and Deletion (Story 5.15)

Enforces the MVP 30-day raw media retention policy and removes private artifacts when an account is deleted. Postgres `interview_artifacts` rows (not R2 bucket listings) are the cleanup source of truth: nothing lists either bucket to infer ownership.

| Variable | Description | Default |
|---|---|---|
| `ARTIFACT_RETENTION_DAYS` | Raw recording/screenshot retention window in days, set on both `backend-rest` (screenshot capture) and `notification-orchestrator` (recording finalization, scheduled sweep). | `30` |
| `ARTIFACT_CLEANUP_BATCH_LIMIT` | Deterministic per-run cap on the number of artifact rows the scheduled sweep processes, set on `notification-orchestrator`. | `100` |

**Scheduled retention sweep**:
- `expires_at` is stamped on every artifact row at write time: screenshot capture and recording finalization both set it to `ARTIFACT_RETENTION_DAYS` days from capture/finalization.
- The existing notification-orchestrator scheduled trigger (`*/5 * * * *`) runs `ArtifactRetentionService.runScheduledRetentionSweep`, which selects up to `ARTIFACT_CLEANUP_BATCH_LIMIT` rows where `expires_at` has passed and `deleted_at IS NULL` (the `idx_interview_artifacts_expiry` partial index), ordered oldest-first.
- For each row: the R2 object is deleted directly (recordings/screenshots bucket resolved from the object key prefix; never a bucket listing), then the row's `object_key` is cleared and `deleted_at` is set in one retry-safe update. An object already removed by the mandatory Story 5.6 R2 lifecycle rule is treated as idempotent success — the database tombstone is still written so the participant artifact API reports `expired` instead of silently looking missing.
- Per-row isolation: a single failed object (R2 unavailable, unexpected error) is counted and logged without aborting the run or clearing that row, so the next scheduled run retries it. There is no separate checkpoint table — a row's `deleted_at IS NULL` state is the retry checkpoint.
- Transcript and feedback are never touched by the scheduled sweep; only raw media is governed by the retention window.

**Account-deletion privacy cleanup**:
- The `DELETE /api/account` soft-delete transaction persists a durable `account.privacy_cleanup_requested` outbox event (keyed by user id) atomically with the soft delete, rather than exposing a separate interview-delete endpoint or a later permanent-purge step.
- The notification-orchestrator queue consumer processes the event by running `ArtifactRetentionService.runPrivacyCleanupForUser`: every interview where the deleted user is scheduler or interviewer has its raw artifacts removed (regardless of expiry) and its `transcript`/`feedback` columns cleared. Because the interview row and its artifacts are shared rather than duplicated per participant, this also removes the counterpart's access in one pass, per the Story 5.2 deletion contract.
- Idempotent and safe to retry: artifact rows already cleared (`deleted_at IS NOT NULL`) are excluded from the next pass, and clearing transcript/feedback to `NULL`/`not_started` twice is a no-op.

**Observability**:
- Both cleanup paths log only structured counters: `scannedInterviews`, `scannedArtifacts`, `recordingDeletions`, `screenshotDeletions`, `alreadyMissingObjects`, `failures`, `clearedRows`.
- Object keys, recording/transcript content, participant identifiers, and provider URLs are never logged by either cleanup path.

**Operational notes**:
- To change the retention window or batch size, update `ARTIFACT_RETENTION_DAYS` / `ARTIFACT_CLEANUP_BATCH_LIMIT` in `apps/notification-orchestrator/wrangler.jsonc` (and `apps/backend-rest/wrangler.jsonc` for `ARTIFACT_RETENTION_DAYS`) and redeploy; both workers fall back to the defaults above if unset or invalid.
- If the sweep falls behind (large backlog, repeated failures), it is safe to let it run across multiple scheduled invocations: `ARTIFACT_CLEANUP_BATCH_LIMIT` bounds each run and already-cleared rows are skipped automatically.

### Workers AI Transcription

Workers AI is used for participant-attributed audio transcription. The `AI` binding and credentials are configured on the notification-orchestrator worker, where `InterviewFeedbackWorkflow` runs (`apps/notification-orchestrator/wrangler.jsonc`).

| Variable | Description |
|---|---|
| `AI` | Workers AI binding (`"ai": { "binding": "AI" }` in `wrangler.jsonc`). Wrapped by `createWorkersAiTranscriptionAdapter`. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for Workers AI. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers AI permissions. |

**Transcription behavior**:
- AI-led sessions require a candidate-specific audio track.
- Peer-to-peer sessions require participant-separated audio tracks mapped to scheduler/interviewer roles.
- Composite audio is playback-only and not transcribed.
- Transcript chunks are persisted to `interview_transcription_chunks` so retries do not retranscribe completed chunks.

### AI Gateway Feedback Analysis

The AI Gateway is used for feedback analysis (separate from AI chat). The analysis request sends aggregated context (transcript, screenshots, metadata) to a high-reasoning LLM via the AI Gateway. Configured on the notification-orchestrator worker (same process as the Workers AI transcription binding above).

| Variable | Description |
|---|---|
| `AI_GATEWAY_BASE_URL` | AI Gateway base URL for feedback analysis, parsed the same way as the Story 4.3 AI chat responder (`extractAiGatewayId`). Unlike AI chat, the feedback analysis adapter has no direct-call fallback: a missing/invalid gateway ID makes every analysis attempt fail (surfacing as `feedback_error_code = 'analysis_failed'` after the bounded retry budget). Not yet committed to `wrangler.jsonc` in any environment, consistent with the AI chat gateway's "optional, not yet adopted" state documented above. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token. |

**Analysis behavior** (Story 5.17; module in `packages/shared-backend/src/interview-feedback/`):
- `feedback-context.ts` builds a bounded, deterministic evidence context: canonical interview metadata, the persisted transcript (truncated deterministically, preserving both beginning and end), and a capture-ordered, count/byte-bounded set of finalized whiteboard screenshots. An empty finalized screenshot set is valid.
- `feedback-prompt.ts` builds the versioned (`FEEDBACK_PROMPT_VERSION`) system-design coaching prompt and multimodal chat messages; the transcript and screenshots are always framed as untrusted evidence that cannot override the system instructions or required response schema.
- `feedback-analysis-adapter.ts` sends the request through Cloudflare AI Gateway (same `cf-aig-gateway-id` REST pattern as the Story 4.3 AI chat responder) to one pinned, server-selected, vision-capable model, with a bounded timeout/retry policy that only retries transport/5xx/429 failures.
- `feedback-analysis-service.ts` parses and strictly validates the response against `interviewFeedbackV1Schema` regardless of provider guarantees, rejecting malformed/partial/unsupported-version/out-of-range/unknown-key output without ever writing `interviews.feedback`.
- `feedback-analysis-repository.ts` persists the complete validated report and transitions `processing -> ready` in one conditional update fenced by the active `feedback_attempt_id`; a stale attempt or an already-`ready` report is a safe no-op, so automatic retries never overwrite an existing report.
- Provider/model identifiers remain server configuration. They are not client-selectable API fields.
- Model name, raw provider response, token usage, system prompt, and provider error text are not persisted in the client feedback object.
- Orchestration, bounded per-step retries, telemetry, and operational replay live in `InterviewFeedbackWorkflow` (Story 5.18; see below).

### Feedback Workflow Reliability, Observability, and Replay (Story 5.18)

`InterviewFeedbackWorkflow` (`apps/notification-orchestrator/src/workflows/feedback-workflow.ts`) orchestrates eligibility, claim, artifact readiness, transcription, analysis, and persistence as one Cloudflare Workflow instance per attempt. Every `step.do` call is configured with a bounded `WorkflowStepConfig` (`retries.limit` + `delay` + `backoff`, plus a per-attempt `timeout`); the per-step budgets are intentionally different (a ~3.3 minute bounded wait for recording/audio finalization, a shorter best-effort wait for optional screenshots, longer timeouts around the transcription/analysis provider calls, short timeouts around plain Postgres reads/writes).

**Retryable vs. non-retryable**:
- Transient conditions (assets not finalized yet, a provider call that should be retried) throw a plain `Error` inside a step so the step's own `retries` config governs the backoff; once that budget is exhausted, the last thrown error is treated as the step's terminal outcome.
- Deterministic, waiting-will-never-help conditions (no `interview_recordings` row at all, a permanent participant-track format/mapping failure, a schema-invalid analysis response that keeps failing, another attempt already owning the interview) throw `NonRetryableError` from `cloudflare:workflows` so the engine does not waste the retry budget on a condition that cannot change.
- `interview_recordings` finalization failures are further classified (`classifyRecordingJobs` in `packages/shared-backend/src/interview-feedback/feedback-artifact-readiness.ts`): a terminal `mapping_error`/`validation_error` is a permanent format/mapping problem (`feedback_unavailable_reason = 'unsupported_format'`); a terminal `provider_error`/`storage_error`/`database_error`/missing code is an infrastructure problem that does not improve by waiting (`feedback_error_code = 'assets_not_ready'` without exhausting the full wait budget).

**Terminal, attempt-fenced writes** (`FeedbackWorkflowRepository`, same package): every terminal transition (`processing -> failed`, `processing -> not_started`) is one conditional `UPDATE ... WHERE feedback_status = 'processing' AND feedback_attempt_id = $attemptId`, so a stale or already-replaced attempt's write is a safe no-op. `not_started` clears every processing/prompt field per `interviews_feedback_not_started_check`; `failed` deliberately keeps `feedback_attempt_id` and the processing timestamps so a later operator replay can still read the prior attempt for its audit row.

**Structured telemetry** (`logFeedbackWorkflowEvent` in `feedback-workflow-events.ts`): emits one line per lifecycle event (`received`, `claimed`, `waiting_for_assets`, `transcribed`, `analysis_started`, `ready`, `retrying`, `failed`, `unavailable`) with only an explicit allowlist of safe fields — interview/workflow-instance IDs, prompt/schema version, step name, attempt number, duration, safe error/unavailable code, and aggregate transcript-length/truncation and screenshot-count/byte metrics. There is no free-form message field, so transcript text, feedback prose, candidate aliases, object keys, signed URLs, and provider credentials/payloads can never be routed into a log line through this function.

**Stale-processing recovery** (automatic; `feedback-stale-processing-sweep.ts`, run from the existing `*/5 * * * *` notification-orchestrator scheduled trigger): fences and recovers a `processing` interview whose `feedback_processing_heartbeat_at` is older than 20 minutes (comfortably above every bounded per-step wait above) — a crashed or evicted Workflow instance that stopped heartbeating. One atomic statement resets the row to `pending` and clears `feedback_attempt_id` (so any write the crashed attempt still makes lands as a no-op), then one new, uniquely suffixed workflow instance (`feedback-v1-{interviewId}-recovered-{timestamp}`) is started per recovered interview. This is fully automatic infrastructure self-healing and is distinct from the operator-only replay procedure below.

**Operational replay (operator-only; MVP has no participant-facing regenerate endpoint or UI control)**: `FeedbackReplayService`/`FeedbackReplayRepository` (`packages/shared-backend/src/interview-feedback/`) implement the business rules an operator runbook follows to recover a genuinely `failed` interview:
1. Inspect the interview's current `feedback_status`, `feedback_error_code`, and (if needed) the safe counters/timestamps already in Postgres; confirm artifact state out-of-band if the error code suggests a data problem rather than a transient provider outage.
2. Run `FeedbackReplayService.replay({ interviewId, operatorIdentity, reason, targetSchemaVersion })` against production Postgres. It refuses to replay anything that is not currently `failed` (including an already-`ready` interview — the MVP schema only defines `schema_version: 1`, so there is no newer version to replay into yet; `targetSchemaVersion` is still recorded on the audit row so a future migration that introduces `schema_version: 2` can extend this guard without changing call sites) and is a safe no-op if the row was concurrently reset by another replay.
3. A successful call resets the interview to `pending` (clearing every processing/error/prompt field) and inserts one durable `feedback_replay_audit` row (operator identity, prior attempt ID, prior error code, target schema version, reason, timestamp) — see `docs/system/system-design/db-schemas.md`.
4. The call returns a uniquely suffixed workflow instance ID (`feedback-v1-{interviewId}-replay-{timestamp}`, distinct from both the original deterministic trigger ID and any stale-recovery ID). The operator starts that instance against the `FEEDBACK_WORKFLOW` binding (e.g. `wrangler workflows instances create feedback-workflow <instanceId> --params '{"interview_id":"...","schema_version":1}'`), which claims the now-`pending` row and produces exactly one new report.

### Auth Email Verification Retention and Monitoring

Better Auth verification links are stateless one-hour HS256 JWTs; request, response, and redirect contracts are documented in `docs/system/system-design/api-routes.md`. This section covers retention, fixed telemetry, and privacy boundaries for operators.

**Never-verified account retention (30 days)**:
- Policy: email/password accounts that have a password credential and remain unverified (`emailVerified = false`) 30 days after creation are deleted together with their dependent credential rows.
- Social-only accounts are excluded. An unverified email on a social-provider account is not an abandonment signal; filtering deletion on `emailVerified` alone would remove active social accounts.
- Current automation gap: the repository has no auth-account cleanup scheduler, and none is added by the verification change. The notification-orchestrator is explicitly excluded from this cleanup. Retention is documented policy without automated enforcement until a separately reviewed follow-up lands.
- Required follow-up contract: transactional, idempotent deletion of the user row and dependent credential/session data selected only among password credentials, no email addresses in deletion logs, and outstanding verification links stop working once the account is deleted (token verification still succeeds, but no user is found).

**Fixed events and operator alerts**:

| Condition | Signal | Operator response |
|---|---|---|
| Verification email accepted | `auth.verification_email.accepted` structured log | Expected on signup or unverified sign-in. Acceptance and queueing only; never mailbox-delivery proof. |
| Provider send rejection | `auth.verification_email.rejected` with `provider`, `outcome`, and an allowlisted `errorCode`; unknown codes map to `UNKNOWN` without raw provider text | Check the sender/domain configuration and Email Service logs. The account stays recoverable through correct-password sign-in. |
| Suppressed recipient | `auth.verification_email.rejected` with `E_RECIPIENT_SUPPRESSED` | Restrict testing to controlled verified destinations and confirm the mailbox accepted previous sends. |
| Daily Email Service limit exceeded | `auth.verification_email.rejected` with `E_DAILY_LIMIT_EXCEEDED` | Stop nonessential sends and wait for the account's daily reset or raise the limit. |
| Invalid sender or sending domain | `auth.verification_email.rejected` with `E_SENDER_NOT_VERIFIED` or `E_SENDER_DOMAIN_NOT_AVAILABLE` | Compare `AUTH_EMAIL_FROM` against the derived sender (`noreply@$EMAIL_SENDING_DOMAIN`) and the bootstrap's email-domain readiness output. |
| Better Auth rate limiting | Database-backed `rateLimit` table; auth requests exceeding limits receive HTTP 429 | Investigate abusive sources at the edge and tune limits. Raw IPs are never written to logs. |
| Missing runtime binding or configuration | `auth.config.missing` containing only the missing binding names; `/api/auth/*` responds `503` before Better Auth runs | Restore `HYPERDRIVE`, `BETTER_AUTH_SECRET`, `EMAIL`, or `AUTH_EMAIL_FROM` bindings. |
| Background send-promise rejection | Rejected `waitUntil` promise surfaces as `auth.verification_email.rejected` with `UNKNOWN` | Correlate with provider incidents; signup state is unaffected and accounts remain recoverable. |

The adapter emits only the allowlisted provider `errorCode` values `E_VALIDATION_ERROR`, `E_FIELD_MISSING`, `E_SENDER_NOT_VERIFIED`, `E_SENDER_DOMAIN_NOT_AVAILABLE`, `E_RECIPIENT_NOT_ALLOWED`, `E_RECIPIENT_SUPPRESSED`, `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`, `E_DELIVERY_FAILED`, and `E_INTERNAL_SERVER_ERROR`; any other provider error maps to `UNKNOWN`. A recipient outside the environment's allowed destinations surfaces as `E_RECIPIENT_NOT_ALLOWED`.

`EmailSendResult.messageId` records provider acceptance or queueing only and must never be reported as proof of mailbox delivery; mailbox confirmation requires a controlled inbox canary.

**Privacy boundaries**:
- Application logs emit fixed event names with safe metadata only. They never contain recipient addresses, verification URLs, JWT tokens, callback query strings, message bodies, or raw provider error messages, and Better Auth's logger is disabled.
- The backend Worker's observability sets `redact_query_string = true` so invocation telemetry cannot retain verification JWT query parameters; `scripts/ensure-redact-query-string.sh` reasserts this setting after every backend deploy because Wrangler 4.73.0 cannot express it in wrangler.jsonc.
- Cloudflare Email Service necessarily retains its own provider-side delivery, bounce, and suppression metadata. That provider-controlled retention is outside the application no-PII contract.
- Message previews are disabled (`preview_enabled = false`) so Email Service does not retain message bodies; a newly provisioned domain enables previews by default, so readiness must verify the setting.
- Local `wrangler dev` simulates sends and writes message content, including verification links, to local files. Those simulator artifacts are sensitive ephemeral data: they stay gitignored, use controlled non-personal addresses, and are deleted after smoke testing.
