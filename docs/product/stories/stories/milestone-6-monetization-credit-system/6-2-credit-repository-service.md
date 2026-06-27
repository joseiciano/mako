# Story 6.2: Credit Repository and Balance Service

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Implement backend credit repository and service operations for atomic credit grants, deductions, balance reads, and ledger reads.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-1-credit-transactions-ledger-migration.md`
- `docs/product/stories/stories/milestone-1-foundation-authentication/2-1-user-profile-quotas.md`
- `docs/system/system-design/concurrency-data-integrity.md`

## What Needs to Be Done

### 1. Create the credit backend module
- [x] Implement `packages/shared-backend/src/credit/` following the Controller-Service-Repository pattern used by existing backend modules.
- [x] Include repository, service, types, and index barrel files. Add a controller file only for route registration hooks used by later credit API stories.
- [x] Keep SQL access manual and direct; query `Credit_Transactions` and `"user".credits` without introducing an ORM.

### 2. Implement transaction-safe repository operations
- [x] Implement `decrementCredits(queryExecutor, userId, amount)` as an atomic conditional update with no transaction management inside the repository.
- [x] Use the shared query executor passed by composed-transaction callers so Free Tier Logic can consume credits inside the interview-creation transaction.
- [x] Return enough mutation metadata for callers to distinguish successful deduction from insufficient balance (`rowCount = 0`).
- [x] Add repository reads for current balance and paginated transaction history, scoped by `user_id`.

### 3. Implement service operations
- [x] Implement `grantCredits(userId, amount, creditsGranted, stripePaymentIntentId)` inside one database transaction: increment `"user".credits` and insert one `Credit_Transactions` row together.
- [x] Implement `deductCredits(userId, creditsToDeduct)` as standalone credit consumption that wraps `decrementCredits` in a transaction and rejects insufficient balance with a business-rule error.
- [x] Implement `getCreditBalance(userId)` returning the current `"user".credits` value.
- [x] Implement `getTransactionHistory(userId, limit?, offset?)` returning paginated `Credit_Transactions` rows sorted newest-first.

### 4. Preserve concurrency and safety guarantees
- [x] Use atomic SQL updates documented in `docs/system/system-design/concurrency-data-integrity.md`: `grantCredits` increments credits by amount; `deductCredits` decrements only when `credits >= creditsToDeduct`.
- [x] Ensure credit balance writes and ledger inserts succeed or fail together for grants.
- [x] Treat duplicate `stripe_payment_intent_id` conflicts as idempotency conflicts for Stripe callers; do not double-grant credits.
- [x] Do not expose internal Stripe control-flow fields from service response shapes.

### 5. Add repository and service tests
- [x] Unit test repository balance deduction with sufficient balance.
- [x] Unit test repository deduction rejection metadata when balance is insufficient.
- [x] Unit test concurrent mutation safety for conditional deduction.
- [x] Unit test `grantCredits` writes both balance increment and ledger row atomically.
- [x] Unit test duplicate payment-intent handling does not grant credits twice.
- [x] Unit test transaction-history repository pagination and newest-first sort.

## Implementation Notes
- `creditRepository.decrementCredits()` is the stable integration point for Free Tier Logic. It must not open or commit its own transaction.
- `creditService.deductCredits()` is only for standalone credit consumption. Callers that need composed-transaction semantics must use the repository directly.
- Do not implement Stripe Payment Intent creation, webhook route handling, free-tier policy resolution, or public transaction-history API in this story.

## End Goal
Backend code has a stable credit module that safely grants and deducts credits, supports composed transactions, and exposes service methods for Stripe, free-tier policy, account balance, and transaction-history API stories.
