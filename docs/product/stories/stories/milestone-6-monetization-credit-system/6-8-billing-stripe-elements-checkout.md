# Story 6.8: Billing Stripe Elements Checkout

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Embed Stripe Elements on `/billing`, confirm credit-package payments client-side, and handle asynchronous webhook fulfillment states safely.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-7-billing-credit-package-selection-and-payment-intent.md`
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-6-stripe-integration.md`
- `docs/infrastructure/frontend.md`

## What Needs to Be Done

### 1. Configure frontend Stripe entry point
- [ ] Install and configure `@stripe/stripe-js` and `@stripe/react-stripe-js` in the frontend application if they are not already present.
- [ ] Load the Stripe publishable key through the existing frontend environment pattern, using a binding such as `VITE_STRIPE_PUBLISHABLE_KEY`.
- [ ] Keep Stripe setup in a focused frontend helper/provider near the billing checkout boundary.
- [ ] Do not place `loadStripe` or Elements provider setup inside package-selection or balance-display components.

### 2. Render Stripe Payment Element after intent creation
- [ ] Render the Stripe Payment Element only after `POST /api/payments/create-intent` returns a valid `client_secret`.
- [ ] Keep package selection visible enough that users understand what they are paying for, but prevent changing package mid-confirmation without restarting the intent flow.
- [ ] Add loading state for Stripe initialization and checkout element readiness.
- [ ] Add accessible labels, focus handling, disabled states, and screen-reader-safe status messaging for checkout progress.

### 3. Confirm payment and handle asynchronous fulfillment UX
- [ ] Confirm payment client-side through Stripe using the returned client secret.
- [ ] Present success, failure, cancellation, and retry states without assuming credits are granted by the browser.
- [ ] After payment confirmation, invalidate or refetch account and credit-transaction queries so webhook-fulfilled balances appear when Postgres reflects the update.
- [ ] If webhook fulfillment is still pending, show a clear pending state and manual refresh affordance instead of showing a false final balance.
- [ ] Disable duplicate payment confirmation while Stripe confirmation is in flight.

### 4. Add checkout behavior tests
- [ ] Add tests that Payment Element renders only after client secret creation.
- [ ] Add tests for checkout initialization loading state and Stripe confirmation failure state.
- [ ] Add tests that duplicate confirmation is blocked while payment confirmation is pending.
- [ ] Add tests that successful payment confirmation invalidates or refetches account and credit-transaction queries.
- [ ] Add presentation tests for pending webhook fulfillment and manual refresh affordance.

## Implementation Notes
- Payment fulfillment remains asynchronous through Stripe webhook handling. The frontend must not grant credits, decrement quotas, or mutate authoritative balances locally.
- Stripe Integration owns backend Payment Intent creation and webhook fulfillment. This story only embeds client-side Stripe Elements and handles user-facing checkout state.
- Use TanStack Query invalidation/refetch for server-backed balance and transaction history refresh.
- Do not implement Stripe Checkout Sessions, subscriptions, saved payment methods, invoices, refunds, Stripe Customer management, or admin billing controls in this story.

## End Goal
Users can complete credit package payments through embedded Stripe Elements on `/billing`, receive clear checkout status, and see balances refresh only after backend webhook fulfillment updates Postgres.
