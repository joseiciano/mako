# Story 6.6: Stripe Integration

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Implement the "Purchase Credits" flow with Stripe Payment Intents, including the create-intent endpoint, webhook handler, and credit fulfillment via the credit service.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-2-credit-repository-service.md`

## What Needs to Be Done

### 1. Configure Stripe SDK and environment
- [ ] Install the Stripe SDK (`stripe`) in `apps/backend-rest/`.
- [ ] Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to:
  - `.dev.vars` for local development
  - `./scripts/set-github-env-secrets.sh` for CI/CD deployment
- [ ] Initialize the Stripe client as a singleton in the backend worker, reading the secret key from environment bindings (Cloudflare Workers secrets).
- [ ] Document Stripe environment variable requirements in `docs/infrastructure/backend.md`.

### 2. Define credit package configuration and expose to frontend
- [ ] Create a shared type definition in `packages/shared/src/credit-packages.ts` containing the `CreditPackage` zod schema and inferred type with fields: `package_id`, `display_name`, `amount_cents`, `credits_granted`. This file holds types only — no package values.
- [ ] Define the credit package price map in `apps/backend-rest/src/config/credit-packages.ts`, typed by the shared `CreditPackage` type. This is the server-side source of truth for price-to-credit mapping; the frontend must not derive credit amounts independently.
- [ ] Start with a minimal set of packages (e.g., 5 credits at $25, 10 credits at $45, 20 credits at $80).
- [ ] Implement `GET /api/payments/packages` in `apps/backend-rest/` that returns the package list as `{ packages: CreditPackage[] }`. Route must be authenticated; reject unauthenticated requests with 401.
- [ ] Document `GET /api/payments/packages` and the `CreditPackage` shape in `docs/system/system-design/api-routes.md` under the Payments & Credits section so Story 6.7 has a contract to reference.

### 3. Implement POST /api/payments/create-intent
- [ ] Implement the route handler in `apps/backend-rest/` as documented in:
  - `docs/system/system-design/api-routes.md` (Payments & Credits / POST /api/payments/create-intent)
- [ ] Request body: `{ package_id: string }`.
- [ ] Validate `package_id` against the server-side package configuration; reject unknown packages with a 400 error.
- [ ] Create a Stripe Payment Intent via the Stripe SDK with:
  - `amount`: resolved from the package config.
  - `currency`: `"usd"`.
  - `metadata`: include `package_id` and `user_id` for idempotency and audit.
- [ ] Return `{ client_secret: string }` from the created Payment Intent.
- [ ] Route must be authenticated; reject unauthenticated requests with 401.
- [ ] Do not store the Payment Intent in Postgres at creation time — the webhook handler creates the authoritative transaction record.

### 4. Implement POST /api/payments/webhook
- [ ] Implement the Stripe webhook handler in `apps/backend-rest/` as documented in:
  - `docs/system/system-design/api-routes.md` (Payments & Credits / POST /api/payments/webhook)
- [ ] Verify the webhook signature using `STRIPE_WEBHOOK_SECRET` before processing any event.
- [ ] Handle `payment_intent.succeeded` events:
  - Extract `stripe_payment_intent_id`, `amount_received`, `metadata.package_id`, and `metadata.user_id` from the event.
  - Resolve `credits_granted` from the package config using `metadata.package_id`.
  - Call the credit service `grantCredits(userId, amount, creditsGranted, stripePaymentIntentId)` from Story 6.2.
  - The unique index on `stripe_payment_intent_id` in `Credit_Transactions` ensures idempotent retries (duplicate events are safe).
- [ ] Handle `payment_intent.payment_failed` events: log the failure with `stripe_payment_intent_id` and user context for operational visibility.
- [ ] Return `200 OK` for all recognized event types to acknowledge receipt.
- [ ] Return `400` for events with invalid signatures.
- [ ] Do not send email confirmations or push notifications in this story — notification scope belongs to the notification service.

### 5. Add Stripe integration tests
- [ ] Unit tests for package validation: valid package accepted, unknown package rejected, missing `package_id` rejected.
- [ ] Unit tests for create-intent handler: Stripe Payment Intent created with correct amount, metadata includes user_id and package_id, client_secret returned.
- [ ] Unit tests for webhook handler with mocked Stripe SDK:
  - `payment_intent.succeeded` calls credit service `grantCredits` with correct parameters.
  - `payment_intent.succeeded` is idempotent (duplicate event does not double-grant credits).
  - `payment_intent.payment_failed` does not grant credits.
  - Invalid signature returns 400.
- [ ] Integration test: end-to-end flow from `create-intent` → mock webhook → verify credit balance updated via `GET /api/account`.
- [ ] Integration test for `GET /api/payments/packages`: authenticated access returns the full package list with correct shapes, unauthenticated returns 401.

## Implementation Notes
- Stripe fulfillment is asynchronous. The `create-intent` endpoint only returns the client secret; credit balance does not change until the webhook processes `payment_intent.succeeded`.
- The frontend confirms the payment client-side via Stripe Elements using the returned `client_secret`. The frontend must not call a backend endpoint to finalize the payment.
- Duplicate webhook events are expected from Stripe. The unique constraint on `Credit_Transactions.stripe_payment_intent_id` is the idempotency guard — the credit service `grantCredits` call should handle the constraint violation gracefully (catch and return success for duplicate events).
- Do not implement Stripe Checkout Sessions (hosted page) in this story — use Stripe Payment Intents with the Elements UI embedded in the Billing Stripe Elements Checkout story (Story 6.8).
- Do not implement subscription logic, saved payment methods, invoices, refunds, or Stripe Customer creation in this story.
- The webhook endpoint must be registered in the Stripe Dashboard pointing to the production URL (`https://api.mako.example.com/api/payments/webhook`). Local testing uses the Stripe CLI (`stripe listen --forward-to localhost:8787/api/payments/webhook`).
- Document local webhook testing steps in `docs/system/local-testing.md`.

## End Goal
Users can initiate a credit purchase through `POST /api/payments/create-intent` which returns a Stripe client secret. Stripe Elements on the frontend (Story 6.8) uses this secret to complete the payment. When Stripe sends a `payment_intent.succeeded` webhook, the backend atomically grants credits to the user's balance and records the transaction in `Credit_Transactions`. Duplicate webhooks are handled idempotently. Payment failures are logged but do not affect balances.
