# Backend Infrastructure

This document goes over all the tools we will be using for our backend services

**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

- **Cloudflare Workers**: Cloudflare workers for the main hosting environment of the backend service. Routes are defined via a singular API worker. [Docs](https://developers.cloudflare.com/api/resources/workers/)
- **Cloudflare Hyperdrive**: We use hyperdrive to speak to our Postgres database instance from Cloudflare Workers. [Docs](https://developers.cloudflare.com/api/resources/hyperdrive/)
- **Cloudflare Realtime**: We will be using Cloudflare Realtime to serve our web streaming. [Docs](https://developers.cloudflare.com/api/resources/realtime_kit/)
**Note**: We will **ALWAYS** be using **Cloudflare RealtimeKit,** **NEVER** use Cloudflare Calls. It is outdated. 
- **Cloudflare Workflows**: We use Workflows to orchestrate the interview lifecycle. This handles the 60-minute interview timer, sends "5-minute" warnings via Realtime, locks the session upon completion, and triggers the AI feedback generation. [Docs](https://developers.cloudflare.com/api/resources/workflows/)
- **Cloudflare Queues**: We use Queues for post-commit hand-off between workers (for example: matcher/API emitted orchestration events consumed by downstream notification/orchestration workers). Realtime session provisioning remains join-time route behavior (`POST /api/interviews/:id/provision`) rather than queue-triggered behavior. [Docs](https://developers.cloudflare.com/queues/)
- **Cron Triggers (Workers Schedules)**: We use cron-triggered workers for background scheduling jobs (for example: the Greedy Matcher worker). [Docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- **Cloudflare R2**: These will save the recording/any screenshots we take. [Docs](https://developers.cloudflare.com/api/resources/r2/)
- **Cloudflare AI Gateway**: We will interact with our AI providers through Cloudflare's AI Gateway service [Docs](https://developers.cloudflare.com/api/resources/ai_gateway/)
- **Stripe**: We use Stripe to handle payments and the pay-per-credit system for scheduling interviews. We will use Stripe Checkout for purchases and webhooks to fulfill credits in our database. [Docs](https://docs.stripe.com/api)

- **Hono**: Hono for defining the routes within the cloudflare worker. As it was built to support workers, this is a very useful tool. [Docs](https://hono.dev/docs/api/hono)
- **Postgres**: We will use a postgres database to handle our data collection. This postgres instance is hosted on [Neon](https://neon.com/docs/introduction). [Docs](https://neon.com/docs/introduction)
- **Better Auth**: We will use better auth to handle authentication as well as email verification. It uses **HTTP-only cookies** for secure session management by default. [Docs](https://better-auth.com/docs/introduction)
- **Zod**: Zod is used for defining data schemas. This is to be used for things like API request shapes. [Docs](https://zod.dev/)
- **zod-openapi**: (or `hono-openapi`) We use this to automatically generate OpenAPI specifications from our Zod schemas and Hono routes, ensuring the documentation stays in sync with the code. [Docs](https://hono.dev/examples/zod-openapi)
- **Excalidraw MCP**: Used by the AI interviewer to interact with and analyze the whiteboard during system design interviews.


**NOTE**: We are speaking to our postgres database directly with SQL queries, speaking to it with Cloudflare Hyperdrive. We are not, and never will be using an orm. Never recommend an orm, never use an orm, never mention an orm. 
