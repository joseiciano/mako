# Story 6.2: Credit Repository and Balance Service

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Implement backend credit repository and service operations for atomic credit grants, deductions, balance reads, and ledger reads.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-1-credit-transactions-ledger-migration.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/2-1-user-profile-quotas.md`
- `docs/system/system-design/concurrency-data-integrity.md`

## What Needs to Be Done

### 1. Create the credit backend module
- [ ] Implement `packages/shared-backend/src/credit/` following the Controller-Service-Repository pattern used by existing backend modules.
- [ ] Include repository, service, types, and index barrel files. Add a controller file only for route registration hooks used by later credit API stories.
- [ ] Keep SQL access manual and direct; query `Credit_Transactions` and `"user".credits` without introducing an ORM.

### 2. Implement transaction-safe repository operations
- [ ] Implement `decrementCredits(queryExecutor, userId, amount)` as an atomic conditional update with no transaction management inside the repository.
- [ ] Use the shared query executor passed by composed-transaction callers so Free Tier Logic can consume credits inside the interview-creation transaction.
- [ ] Return enough mutation metadata for callers to distinguish successful deduction from insufficient balance (`rowCount = 0`).
- [ ] Add repository reads for current balance and paginated transaction history, scoped by `user_id`.

### 3. Implement service operations
- [ ] Implement `grantCredits(userId, amount, creditsGranted, stripePaymentIntentId)` inside one database transaction: increment `"user".credits` and insert one `Credit_Transactions` row together.
- [ ] Implement `deductCredits(userId, creditsToDeduct)` as standalone credit consumption that wraps `decrementCredits` in a transaction and rejects insufficient balance with a business-rule error.
- [ ] Implement `getCreditBalance(userId)` returning the current `"user".credits` value.
- [ ] Implement `getTransactionHistory(userId, limit?, offset?)` returning paginated `Credit_Transactions` rows sorted newest-first.

### 4. Preserve concurrency and safety guarantees
- [ ] Use atomic SQL updates documented in `docs/system/system-design/concurrency-data-integrity.md`: `grantCredits` increments credits by amount; `deductCredits` decrements only when `credits >= creditsToDeduct`.
- [ ] Ensure credit balance writes and ledger inserts succeed or fail together for grants.
- [ ] Treat duplicate `stripe_payment_intent_id` conflicts as idempotency conflicts for Stripe callers; do not double-grant credits.
- [ ] Do not expose internal Stripe control-flow fields from service response shapes.

### 5. Add repository and service tests
- [ ] Unit test repository balance deduction with sufficient balance.
- [ ] Unit test repository deduction rejection metadata when balance is insufficient.
- [ ] Unit test concurrent mutation safety for conditional deduction.
- [ ] Unit test `grantCredits` writes both balance increment and ledger row atomically.
- [ ] Unit test duplicate payment-intent handling does not grant credits twice.
- [ ] Unit test transaction-history repository pagination and newest-first sort.

## Implementation Notes
- `creditRepository.decrementCredits()` is the stable integration point for Free Tier Logic. It must not open or commit its own transaction.
- `creditService.deductCredits()` is only for standalone credit consumption. Callers that need composed-transaction semantics must use the repository directly.
- Do not implement Stripe Payment Intent creation, webhook route handling, free-tier policy resolution, or public transaction-history API in this story.

## End Goal
Backend code has a stable credit module that safely grants and deducts credits, supports composed transactions, and exposes service methods for Stripe, free-tier policy, account balance, and transaction-history API stories.
