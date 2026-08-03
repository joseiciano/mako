# Story 6.7: Billing Credit Package Selection and Payment Intent

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Add credit package selection to `/billing` and initiate Stripe Payment Intents through the backend payments API.
**Status**: Done
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-5-billing-route-shell-and-balance-summary.md`
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-6-stripe-integration.md`
- `docs/system/system-design/api-routes.md`

## What Needs to Be Done

### 1. Fetch and render credit packages
- [ ] Add a TanStack Query hook for `GET /api/payments/packages`.
- [ ] Consume the response wrapper `{ packages: CreditPackage[] }`.
- [ ] Render each package using `package_id`, `display_name`, `amount_cents`, and `credits_granted` from the shared `CreditPackage` type in `packages/shared/src/credit-packages.ts`.
- [ ] Add loading and error states for package data without blocking already-loaded account balance display.
- [ ] If the backend endpoint is not yet available during frontend development, use MSW mock data shaped by `packages/shared/src/credit-packages.ts`.

### 2. Implement single-package selection UX
- [ ] Allow users to select exactly one package at a time.
- [ ] Use accessible radio-group or equivalent single-select semantics with visible selected state.
- [ ] Validate package selection client-side before calling the backend.
- [ ] Keep backend package validation and amount mapping authoritative; the frontend must not derive payment amounts independently.

### 3. Create payment intent from selected package
- [ ] Call `POST /api/payments/create-intent` with `{ package_id }` only after a valid package is selected.
- [ ] Consume the returned `{ client_secret }` and store it in local billing purchase state for the checkout story to use.
- [ ] Disable duplicate purchase submissions while create-intent is in flight.
- [ ] Surface payment initiation failures with retry-safe user-facing messaging.

### 4. Add package selection and create-intent tests
- [ ] Add tests for package loading, package error, and populated package states.
- [ ] Add tests that package selection calls `POST /api/payments/create-intent` with the selected `package_id`.
- [ ] Add tests that missing selection prevents the create-intent request.
- [ ] Add tests that duplicate submit is blocked while create-intent is pending.

## Implementation Notes
- Build on the smart/dumb billing route structure from Story 6.5.
- Server state should use TanStack Query. Selected package and transient create-intent state may stay local to the billing smart component or a focused hook.
- The server-side credit package configuration from Stripe Integration remains the source of truth for price-to-credit mapping.
- This story stops after payment intent creation. It does not render Stripe Payment Element, confirm payment, grant credits, or mutate balances locally.
- Do not add subscriptions, saved payment methods, invoices, refunds, or admin billing controls in this story.

## End Goal
Users can choose one credit package on `/billing` and start a purchase request that returns a Stripe client secret without duplicate submissions or client-side amount authority.
