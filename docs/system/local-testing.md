# Local Development Stack

Run the whole app locally with one command:

```bash
pnpm install
cp .env.example .env   # optional; defaults are used when .env is missing
pnpm dev
```

`pnpm dev` (`scripts/dev/dev-stack.mjs`):

1. Starts local Postgres from `docker-compose.dev.yml` (`127.0.0.1:54331`, database `mako_dev`).
2. Runs `pnpm db:migrate` against it.
3. Writes `apps/backend-rest/.dev.vars` and `apps/notification-orchestrator/.dev.vars` from `.env` (gitignored).
4. Runs one `wrangler dev` session with backend-rest (`:8787`), notification-orchestrator and greedy-matcher. R2, Queues, Workflows and rate limiting are emulated locally; Hyperdrive points at the local Postgres through `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. The orchestrator runs from a generated config (`wrangler.dev.generated.jsonc`, gitignored) without the `ai` binding, because Workers AI has no local emulation.
5. Runs the frontend on `:3000`, proxying `/api` to the backend.

Ctrl+C stops all processes and Postgres. Related commands: `pnpm dev:stack:down`, `pnpm dev:stack:reset` (wipes the dev database), `pnpm dev:apps` (per-app `dev` scripts only, no Postgres or emulator setup). Local state lives in `.wrangler/state`. `.env.example` documents every local variable.

# Local Testing Environment

This guide defines the local test workflow for the Mako monorepo.

## 1. Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (or Docker Engine with Compose)

## 2. Test Environment Variables

1. Copy `.env.test.example` to `.env.test`.
2. Update values only if your local ports/credentials differ.

The default setup uses an isolated local Postgres database:

- host: `127.0.0.1`
- port: `54329`
- database: `mako_test`

The test database reset flow refuses to run unless `DATABASE_URL` points to localhost and a database name ending in `_test`.

## 3. One-Command Local Test Stack

Start the full stack required for local testing:

```bash
pnpm test:stack up
```

This command:

1. Starts local Postgres via `docker-compose.test.yml`
2. Resets the test database and re-runs migrations
3. Boots backend worker emulation (`@mako/backend-rest`)
4. Boots frontend local app server (`@mako/frontend`)

When you are done, stop everything cleanly:

```bash
pnpm test:stack down
```

You can also rebuild local test resources from scratch:

```bash
pnpm test:stack reset
```

## 4. Test Commands

- Run all tests: `pnpm test`
- Watch mode (all workspaces): `pnpm test:watch`
- Coverage (all workspaces): `pnpm test:coverage`

Each app/package now uses Vitest with consistent scripts:

- `test`
- `test:watch`
- `test:coverage`

## 5. Troubleshooting

### Port already in use

- `54329` conflict: update `docker-compose.test.yml` and `DATABASE_URL` in `.env.test`
- `3000` or `8787` conflict: stop the process using that port before `pnpm test:stack up`

### Docker not running

- Ensure Docker Desktop/Engine is started
- Re-run `pnpm test:stack up`

### Reset safety check fails

- Verify `DATABASE_URL` points to localhost (`localhost` or `127.0.0.1`)
- Verify the database name ends in `_test`

## Stripe Webhook Local Testing

The `POST /api/payments/webhook` endpoint verifies Stripe webhook signatures using `STRIPE_WEBHOOK_SECRET`. To test webhook handling locally:

1. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and authenticate:
   ```bash
   stripe login
   ```

2. Start the backend worker locally (defaults to `localhost:8787`):
   ```bash
   pnpm --filter @mako/backend-rest dev
   ```

3. Forward Stripe webhook events to the local worker:
   ```bash
   stripe listen --forward-to localhost:8787/api/payments/webhook
   ```

4. Copy the `whsec_...` signing secret printed by `stripe listen` and set it as `STRIPE_WEBHOOK_SECRET` in `apps/backend-rest/.dev.vars`. Restart the worker so it picks up the new secret.

5. Trigger a test event with payment metadata that matches the backend package contract:
   ```bash
   stripe trigger payment_intent.succeeded \
     --add 'data.object.metadata.package_id=credits_5' \
     --add 'data.object.metadata.user_id=11111111-1111-4111-8111-111111111111'
   ```

   The worker logs the credit grant. Verify the user's credit balance updated via `GET /api/account`. The `user_id` must match a real local user; the demo account ID above works in demo-mode flows.

**Note**: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must both be present in `.dev.vars` for local payment flows. The Stripe SDK client is initialized from `STRIPE_SECRET_KEY`; webhook signature verification uses `STRIPE_WEBHOOK_SECRET`.

## RealtimeKit Recording Finalization Local Testing

Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, in `apps/backend-rest/.dev.vars`. `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL` is a plain `vars` binding already set in `apps/backend-rest/wrangler.jsonc` (`https://api.realtime.cloudflare.com/.well-known/webhooks.json`); override it in `.dev.vars` only to point at a test key endpoint. `CLOUDFLARE_API_TOKEN` needs the account `Realtime` or `Realtime Admin` permission so the backend can start and stop recordings, and notification-orchestrator needs the same three Cloudflare values to stop recordings after an interview completes. Run notification-orchestrator with matching `HYPERDRIVE`, private R2, and RealtimeKit bindings from its `wrangler.jsonc`.

`POST /api/webhooks/realtimekit` requires raw-body `rtk-signature` and `rtk-uuid` headers. Accepted `UPLOADED` events create deterministic `RecordingFinalizationWorkflow` instances; the five-minute scheduled sweep retries due checkpoints.
