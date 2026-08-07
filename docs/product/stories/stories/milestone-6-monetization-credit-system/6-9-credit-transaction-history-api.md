# Story 6.9: Credit Transaction History API

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Add the shared response types and authenticated API route for user-scoped credit transaction history.
**Status**: Done
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-1-credit-transactions-ledger-migration.md`
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-2-credit-repository-service.md`
- `docs/system/system-design/api-routes.md`

## What Needs to Be Done

### 1. Document the route contract
- [ ] Add `GET /api/account/transactions` under Account Management or Payments & Credits in `docs/system/system-design/api-routes.md`.
- [ ] Route description: returns paginated credit transaction history for the authenticated user.
- [ ] Query params: `limit` (default 20) and `offset` (default 0).
- [ ] Response shape: `{ transactions: Array<{ id, amount, credits_granted, status, created_at }>, total: number }`.
- [ ] Sort order: `created_at DESC` (newest first).

### 2. Add shared transaction-history types
- [ ] Create `packages/shared/src/credit.ts` with zod schemas and inferred types for `CreditTransaction` and `CreditTransactionHistoryResponse`.
- [ ] `CreditTransaction` includes only user-safe fields: `id`, `amount`, `credits_granted`, `status`, `created_at`.
- [ ] Do not include `user_id`, `stripe_payment_intent_id`, webhook metadata, or other internal Stripe control-flow fields in shared client-facing types.

### 3. Implement the authenticated route handler
- [ ] Implement the handler in `packages/shared-backend/src/credit/credit-controller.ts` and delegate to the credit service from Story 6.2.
- [ ] Register the controller in `apps/backend-rest/src/index.ts` via `registerCreditController`, matching the existing account controller pattern.
- [ ] Require a valid session; reject unauthenticated requests with 401.
- [ ] Scope all returned rows to the authenticated `userId`; clients must not be able to request another user's history.
- [ ] Validate and normalize pagination params before calling the service.

### 4. Add transaction-history API tests
- [ ] Integration test authenticated access returns only the current user's transaction history.
- [ ] Integration test unauthenticated access returns 401.
- [ ] Integration test pagination with `limit` and `offset`.
- [ ] Integration test newest-first sorting.
- [ ] Integration test new users receive an empty history with `total: 0`.
- [ ] Integration test response body excludes `stripe_payment_intent_id` and any internal Stripe fields.

## Implementation Notes
- This story exposes ledger reads only. Credit grants remain owned by the credit service and Stripe webhook story.
- The frontend billing history story consumes the shared types from this story.
- Do not implement billing UI, Stripe Payment Intents, webhook handling, or free-tier consumption in this story.

## End Goal
Authenticated users can fetch paginated, newest-first credit transaction history through `GET /api/account/transactions` using shared types that expose only user-safe ledger fields.
