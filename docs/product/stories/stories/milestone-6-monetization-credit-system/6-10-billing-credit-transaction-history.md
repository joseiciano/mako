# Story 6.10: Billing Credit Transaction History

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Add credit transaction history to `/billing` so users can review credit purchases and payment fulfillment status.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-8-billing-stripe-elements-checkout.md`
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-9-credit-transaction-history-api.md`
- `docs/system/system-design/api-routes.md`

## What Needs to Be Done

### 1. Fetch transaction history
- [ ] Add a TanStack Query hook for `GET /api/account/transactions?limit=20&offset=0` defined in the Credit Transaction History API story.
- [ ] Consume the shared response shape from `packages/shared/src/credit.ts`: `{ transactions: CreditTransaction[], total: number }`.
- [ ] Keep default query parameters at `limit=20&offset=0` for the initial billing dashboard implementation.
- [ ] If the backend endpoint is not yet available during frontend development, use MSW mock data shaped by `packages/shared/src/credit.ts`.

### 2. Render transaction rows and empty state
- [ ] Render transaction rows from backend data backed by `Credit_Transactions`: amount paid, credits granted, status, and creation time.
- [ ] Sort transaction history newest-first unless the prerequisite API contract defines a different stable order.
- [ ] Include an empty history state for users who have not purchased credits yet.
- [ ] Show only user-safe receipt/reference values if the prerequisite API later exposes one; never expose internal webhook control-flow fields such as raw `stripe_payment_intent_id`.

### 3. Handle history loading, error, and refresh states
- [ ] Add loading state for transaction-history data that does not hide already-loaded balances or checkout state.
- [ ] Add error state for transaction-history loading failures with retry affordance when existing query patterns support it.
- [ ] Include manual refresh behavior that also supports the pending webhook-fulfillment state from Story 6.8.
- [ ] Keep table/list markup accessible with clear row labels, status text, and responsive layout.

### 4. Add transaction history tests
- [ ] Add tests for transaction-history loading, error, empty, and populated states.
- [ ] Add tests for transaction-history row rendering of amount paid, credits granted, status, and creation time.
- [ ] Add tests that pending payment refresh behavior refetches account and transaction-history data.
- [ ] Add tests that internal Stripe control-flow fields are not rendered if mock data includes them accidentally.

## Implementation Notes
- Financial history is backed by `Credit_Transactions`; the frontend renders backend data only.
- The transaction history API must be authenticated and user-scoped as defined by the Credit Transaction History API story.
- This story completes the billing dashboard by adding history presentation. It does not add subscriptions, saved payment methods, invoices, refunds, or admin billing controls.

## End Goal
Users can review recent credit purchase history on `/billing`, including empty, loading, error, pending-refresh, and populated states, without exposing internal payment control-flow details.
