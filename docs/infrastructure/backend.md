# Backend Infrastructure

This document goes over all the tools we will be using for our backend services

- **Cloudflare Workers**: Cloudflare workers for the main hosting environment of the backend service. Routes are defined via a singular API worker.
- **Cloudflare Hyperdrive**: We use hyperdrive to speak to our Postgres database instance from Cloudflare Workers
- **Cloudflare Realtime**: We will be using Cloudflare Realtime to serve our web streaming. 
- **Cloudflare Workflows**: We use Workflows to orchestrate the interview lifecycle. This handles the 60-minute interview timer, sends "5-minute" warnings via Realtime, locks the session upon completion, and triggers the AI feedback generation.
- **Cloudflare R2**: These will save the recording/any screenshots we take. 
- **Cloudflare AI Gateway**: We will interact with our AI providers through Cloudflare's AI Gateway service
- **Stripe**: We use Stripe to handle payments and the pay-per-credit system for scheduling interviews. We will use Stripe Checkout for purchases and webhooks to fulfill credits in our database.

- **Hono**: Hono for defining the routes within the cloudflare worker. As it was built to support workers, this is a very useful tool.
- **Postgres**: We will use a postgres database to handle our data collection. This postgres instance is hosted on [Neon](https://neon.com/docs/introduction). 
- **Better Auth**: We will use better auth to handle authentication as well as email verification. 
- **Zod**: Zod is used for defining data schemas. This is to be used for things like API request shapes.

