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

# Docker Local Stack

The whole app runs in Docker under the Compose project `mako-local` (`docker-compose.local.yml`): Postgres, a one-shot migrate job, the workers container (backend-rest, notification-orchestrator and greedy-matcher in one `wrangler dev`, plus a cron timer), the frontend, and a one-shot seed job. Docker Desktop (or Docker Engine with Compose) is the only extra requirement.

## Commands

| Command | What it does |
|---|---|
| `pnpm local:up` | Starts Postgres, runs migrations, starts workers and frontend, seeds the users. Safe to repeat. |
| `pnpm local:down` | Stops the stack. Data stays in Docker volumes. |
| `pnpm local:reset` | Deletes all local data and volumes, then starts clean and seeds. |
| `pnpm local:seed` | Creates the four role users and premium slots. Safe to repeat. |
| `pnpm local:smoke` | Checks health, sign-in and roles against the running stack. |
| `pnpm local:smoke:workers` | Sends 40 auth requests and fails if the workers container crashes or returns a 5xx. |
| `pnpm test:local-stack` | Runs the unit tests for the stack scripts. Needs no running stack. |

## URLs and ports

| Service | Address |
|---|---|
| App (frontend, proxies `/api` to workers) | `http://localhost:3000` |
| Workers (backend API) | `http://localhost:8788` |
| Postgres (database `mako_local`) | `127.0.0.1:54332`, user `postgres`, password `postgres` |

These ports are fixed in `scripts/local-stack/constants.mjs` and `docker-compose.local.yml`. They do not conflict with `pnpm dev` (Postgres `54331`, backend `8787`).

## Seeded users

All four users share one password. It is for local use only. Never reuse it anywhere else.

Password: `LocalDevPassw0rd!` (defined in `scripts/local-stack/constants.mjs`)

| Role | Email |
|---|---|
| Learner (10 credits) | `learner@mako.test` |
| Interviewer | `interviewer@mako.test` |
| Verified interviewer | `verified@mako.test` |
| Admin | `admin@mako.test` |

## Logs

Raw `docker compose` calls need the three variables that `pnpm local:*` sets for you. Set them once in your shell:

```bash
export LOCAL_DATABASE_URL='postgres://postgres:postgres@postgres:5432/mako_local?sslmode=disable'
export LOCAL_POSTGRES_PORT=54332
export LOCAL_WORKERS_PORT=8788
```

Follow the logs of one service (`postgres`, `migrate`, `workers`, `frontend` or `seed`):

```bash
docker compose -p mako-local -f docker-compose.local.yml logs -f workers
```

## Read the verification email

The stack has no mail server. The email binding writes each message to a file inside the `workers` container, and the workers log shows the path (`Text: /tmp/miniflare-<hash>/files/email-text/<id>.txt`). The `<hash>` changes when the container is recreated. After you sign up in the app, print the newest verification email:

```bash
docker compose -p mako-local -f docker-compose.local.yml exec workers \
  sh -c 'cat "$(ls -t /tmp/miniflare-*/files/email-text/*.txt | head -1)"'
```

The output contains the link `http://localhost:3000/api/auth/verify-email?token=...`. Open it in the browser to verify the account. The matching HTML file is in `email-html/` next to `email-text/`.

## Environment variables

The stack reads no `.env` file, so `.env.example` has no entries for it. Two optional shell variables exist:

- `LOCAL_DATABASE_URL`: overrides the database URL. Only localhost, `127.0.0.1`, `::1` and the `postgres` service are accepted.
- `LOCAL_APP_ORIGIN`: app URL used by `pnpm local:smoke:workers` (default `http://localhost:3000`).

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

## Local Docker Stack Fakes

`pnpm local:up` runs against real test-mode credentials by default. Set `LOCAL_FAKES=1` (in the shell or the repo `.env`) before `pnpm local:up` to start the `fakes` service (`apps/fakes`, host port 8790) and point the local workers' `CLOUDFLARE_API_BASE_URL` at it. With it on, the RealtimeKit room and recording routes answer with canned success payloads, so booking an interview and provisioning its room works with no external network. The fakes accept any bearer token but require the `Authorization` header. Unset the setting and run `pnpm local:up` again to return to the default; the `fakes` container is then removed.

Recording status reads return `UPLOADED` with an `https://fakes.invalid/...` download URL, which passes the finalization workflow's https check. The generated orchestrator config runs through `docker/local/orchestrator-fakes-entry.mjs`, which rewrites that host to the fakes service; the fakes serve the file at `GET /recordings/:file` as `video/webm`. With fakes on, AI chat and feedback analysis also run locally. The workers get an `AI_GATEWAY_BASE_URL` var, so AI chat and feedback analysis call the fakes `ai/v1/chat/completions` route (the `ai/run/...` route is also served). Chat requests get a canned reply; requests that ask for a JSON object get a canned feedback report that passes the v1 feedback schema. The generated orchestrator config binds a small fake worker (`apps/fakes/src/ai-binding-worker.ts`) as `AI`, so the transcription step has a model to call; it returns canned transcript text. With fakes off, the orchestrator config has no `ai` binding, as before. The fake recording bytes are not real audio, so the transcription step reads canned text and not the recording.

With fakes on, Stripe runs against a `stripe/stripe-mock` container (pinned tag in `docker-compose.local.yml`, port 12111 inside the Compose network): the workers get a `STRIPE_API_BASE_URL` var, so `POST /api/payments/create-intent` returns a payment intent from stripe-mock with no external network. stripe-mock does not send webhooks, so complete the purchase by calling the fakes service: `curl -X POST http://localhost:8790/stripe/payment-succeeded -d '{"payment_intent_id":"pi_local_1","user_id":"<learner id>","package_id":"credits_5","amount_cents":2500}'`. The fakes service builds a `payment_intent.succeeded` event, signs it with the local webhook secret (`whsec_placeholder`, a dev value) and posts it to `/api/payments/webhook`; the backend still verifies the signature, then grants the credits. Repeating the same `payment_intent_id` does not grant twice. With fakes off, `STRIPE_API_BASE_URL` is unset and the SDK uses `api.stripe.com`.

### Simulated recording upload

With fakes on, the whole recording chain runs with no external network: book, provision the room, start, upload, finalize.

1. Start clean with fakes on: `LOCAL_FAKES=1 pnpm local:reset`.
2. As the learner (`learner@mako.test`, 10 seeded credits), book an interview (`POST /api/interviews`), provision it, consent to recording (`POST /api/interviews/:id/recording-consent`) and start it. Starting asks the fakes for a composite and a participant-track recording.
3. List the recordings the fakes started: `curl http://localhost:8790/realtimekit/recordings`.
4. Send the signed `UPLOADED` webhook for each one: `curl -X POST http://localhost:8790/realtimekit/recording-uploaded -d '{"recording_id":"<recording_id>"}'`. The fakes sign the event with a local RSA key generated when the `fakes` container starts and post it to `/api/webhooks/realtimekit`. The backend verifies it with the same verifier as production, reading the public key from `http://fakes:8790/realtimekit/.well-known/webhooks.json`: the generated backend config sets `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL` there while fakes are on. No key is committed. A request with a bad signature gets `401`.
5. Each accepted `UPLOADED` event starts a `RecordingFinalizationWorkflow`. Follow it with `docker compose -p mako-local -f docker-compose.local.yml logs workers`. When both recordings finish, `GET /api/interviews/:id` reports `recording_status: "ready"`.

To run the whole chain as a test, start the stack with fakes on and run `pnpm local:e2e:recording`. It also checks that a wrongly signed webhook is rejected. It needs the stack up, so `pnpm test` and `pnpm test:local-stack` do not run it.
