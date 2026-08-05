# Backend Infrastructure

This document goes over all the tools we will be using for our backend services

**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

- **Cloudflare Workers**: Cloudflare workers for the main hosting environment of the backend service. Routes are defined via a singular API worker. [Docs](https://developers.cloudflare.com/api/resources/workers/)
- **Cloudflare Hyperdrive**: We use hyperdrive to speak to our Postgres database instance from Cloudflare Workers. [Docs](https://developers.cloudflare.com/api/resources/hyperdrive/)
- **Cloudflare Realtime**: We will be using Cloudflare Realtime to serve our web streaming. [Docs](https://developers.cloudflare.com/api/resources/realtime_kit/)
**Note**: We will **ALWAYS** be using **Cloudflare RealtimeKit,** **NEVER** use Cloudflare Calls. It is outdated. 
  - Backend room provisioning requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_REALTIMEKIT_APP_ID` for the `POST /api/interviews/:id/provision` route.
- **Cloudflare Workflows**: We use Workflows to orchestrate the interview lifecycle. This handles the 60-minute interview timer, emits structured `timer_warning`/`timer_completed` logs, and converges on a guarded lifecycle transition upon completion. Realtime warning delivery, session locking, and AI feedback generation are future scope. [Docs](https://developers.cloudflare.com/api/resources/workflows/)
- **Cloudflare Queues**: We use Queues for post-commit hand-off between workers (for example: matcher/API emitted orchestration events consumed by downstream notification/orchestration workers). Realtime session provisioning remains join-time route behavior (`POST /api/interviews/:id/provision`) rather than queue-triggered behavior. [Docs](https://developers.cloudflare.com/queues/)
- **Cron Triggers (Workers Schedules)**: We use cron-triggered workers for background scheduling jobs (for example: the Greedy Matcher worker). [Docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- **Notification Orchestrator Worker**: A dedicated queue consumer worker that processes `interview.created`, `interview.cancelled`, `interview.match.created`, and `reminder.due` events with durable idempotency via Postgres-backed checkpoints. It also runs on a scheduled cron to dispatch pending outbox events and enqueue due reminders.
- **Durable Outbox Pattern**: Interview lifecycle events are persisted to a `notification_outbox_events` table within the same database transaction as the source write (interview create/cancel/match). A separate dispatch step (post-commit or scheduled sweep) publishes these events to the queue, ensuring committed events are never silently lost even if the queue is temporarily unavailable.
- **Cloudflare R2**: These will save the recording/any screenshots we take. [Docs](https://developers.cloudflare.com/api/resources/r2/)
- **Cloudflare AI Gateway**: We will interact with our AI providers through Cloudflare's AI Gateway service [Docs](https://developers.cloudflare.com/api/resources/ai_gateway/)
- **Stripe**: We use Stripe to handle payments and the pay-per-credit system for scheduling interviews. We will use Stripe Checkout for purchases and webhooks to fulfill credits in our database. [Docs](https://docs.stripe.com/api)

- **Hono**: Hono for defining the routes within the cloudflare worker. As it was built to support workers, this is a very useful tool. [Docs](https://hono.dev/docs/api/hono)
- **Postgres**: We will use a postgres database to handle our data collection. This postgres instance is hosted on [Neon](https://neon.com/docs/introduction). [Docs](https://neon.com/docs/introduction)
- **Better Auth**: We will use better auth to handle authentication as well as email verification. It uses **HTTP-only cookies** for secure session management by default. [Docs](https://better-auth.com/docs/introduction)
- **Zod**: Zod is used for defining data schemas. This is to be used for things like API request shapes. [Docs](https://zod.dev/)
- **zod-openapi**: (or `hono-openapi`) We use this to automatically generate OpenAPI specifications from our Zod schemas and Hono routes, ensuring the documentation stays in sync with the code. [Docs](https://hono.dev/examples/zod-openapi)
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
