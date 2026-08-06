# Story 6.8: Billing Stripe Elements Checkout

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Embed Stripe Elements on `/billing`, confirm credit-package payments client-side, and handle asynchronous webhook fulfillment states safely.
**Status**: Done
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-7-billing-credit-package-selection-and-payment-intent.md`
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-6-stripe-integration.md`
- `docs/infrastructure/frontend.md`

## What Needs to Be Done

### 1. Configure frontend Stripe entry point
- [x] Install and configure `@stripe/stripe-js` and `@stripe/react-stripe-js` in the frontend application if they are not already present.
- [x] Load the Stripe publishable key through the existing frontend environment pattern, using a binding such as `VITE_STRIPE_PUBLISHABLE_KEY`.
- [x] Keep Stripe setup in a focused frontend helper/provider near the billing checkout boundary.
- [x] Do not place `loadStripe` or Elements provider setup inside package-selection or balance-display components.

### 2. Render Stripe Payment Element after intent creation
- [x] Render the Stripe Payment Element only after `POST /api/payments/create-intent` returns a valid `client_secret`.
- [x] Keep package selection visible enough that users understand what they are paying for, but prevent changing package mid-confirmation without restarting the intent flow.
- [x] Add loading state for Stripe initialization and checkout element readiness.
- [x] Add accessible labels, focus handling, disabled states, and screen-reader-safe status messaging for checkout progress.

### 3. Confirm payment and handle asynchronous fulfillment UX
- [x] Confirm payment client-side through Stripe using the returned client secret.
- [x] Present success, failure, cancellation, and retry states without assuming credits are granted by the browser.
- [x] After payment confirmation, invalidate or refetch the account query so webhook-fulfilled balances appear when Postgres reflects the update.
- [x] If webhook fulfillment is still pending, show a clear pending state and manual refresh affordance instead of showing a false final balance.
- [x] Disable duplicate payment confirmation while Stripe confirmation is in flight.

### 4. Add checkout behavior tests
- [x] Add tests that Payment Element renders only after client secret creation.
- [x] Add tests for checkout initialization loading state and Stripe confirmation failure state.
- [x] Add tests that duplicate confirmation is blocked while payment confirmation is pending.
- [x] Add tests that successful payment confirmation invalidates or refetches the account query.
- [x] Add presentation tests for pending webhook fulfillment and manual refresh affordance.

## Implementation Notes
- Payment fulfillment remains asynchronous through Stripe webhook handling. The frontend must not grant credits, decrement quotas, or mutate authoritative balances locally.
- The billing smart component persists `{ packageId, clientSecret }` to `sessionStorage` (`mako.billing.purchase`) so the selected package and checkout survive a Stripe 3DS full-page redirect and are restored on remount.
- On 3DS redirect return, the checkout detects the returned `payment_intent_client_secret` (validated to match the active draft's secret) and goes straight to a pending-fulfillment state instead of re-offering a duplicate confirm.
- Stripe Integration owns backend Payment Intent creation and webhook fulfillment. This story only embeds client-side Stripe Elements and handles user-facing checkout state.
- Use TanStack Query invalidation/refetch for server-backed balance and transaction history refresh.
- Do not implement Stripe Checkout Sessions, subscriptions, saved payment methods, invoices, refunds, Stripe Customer management, or admin billing controls in this story.

## End Goal
Users can complete credit package payments through embedded Stripe Elements on `/billing`, receive clear checkout status, and see balances refresh only after backend webhook fulfillment updates Postgres.
