# Story 6.1: Credit Transactions Ledger Migration

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Add the credit transaction ledger table used for Stripe fulfillment history and authenticated transaction-history reads.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-1-foundation-authentication/1-3-database-migration-system.md`
- `docs/system/system-design/db-schemas.md`

## What Needs to Be Done

### 1. Create the Credit_Transactions migration
- [ ] Create a versioned SQL migration in `packages/shared-backend/migrations/` using the workflow documented in `docs/system/system-design/db-schemas.md`.
- [ ] Create the `Credit_Transactions` table as defined in `docs/system/system-design/db-schemas.md` (Credit_Transactions section).
- [ ] Include columns: `id` (uuid PK), `user_id` (uuid FK → `"user".id`), `stripe_payment_intent_id` (text UNIQUE), `amount` (integer, cents), `credits_granted` (integer), `status` (text), `created_at` (timestamptz).
- [ ] Set `created_at` from the database clock for new rows.

### 2. Add ledger constraints and indexes
- [ ] Add a unique constraint or unique index on `stripe_payment_intent_id` so duplicate Stripe webhook deliveries cannot grant credits twice.
- [ ] Add an index on `(user_id, created_at DESC)` for user-scoped transaction history queries.
- [ ] Preserve the existing `"user".credits >= 0` constraint; do not modify user balance schema unless an implementation gap is found.

### 3. Add migration tests
- [ ] Add migration-level verification that the table, columns, foreign key, unique payment-intent guard, and user-history index exist after migration.
- [ ] Add a duplicate `stripe_payment_intent_id` test or migration fixture assertion showing duplicate ledger rows are rejected.
- [ ] Add a foreign-key assertion showing transaction rows cannot reference a missing user.

## Implementation Notes
- This story only creates the durable ledger schema. It does not implement credit services, account routes, Stripe routes, or frontend billing UI.
- `stripe_payment_intent_id` is populated by the Stripe webhook story; the column exists here only as the idempotency key.
- Transaction statuses remain text for this milestone to match the current design document.

## End Goal
The database has a versioned, indexed, and idempotency-safe `Credit_Transactions` ledger ready for later credit service and Stripe fulfillment work.
