-- Add credit_transactions ledger for Stripe fulfillment history and authenticated reads.
-- Enforces idempotency via unique stripe_payment_intent_id.

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES "user"(id),
  stripe_payment_intent_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  credits_granted INTEGER NOT NULL CHECK (credits_granted >= 0),
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- Prevent duplicate Stripe webhook deliveries from granting credits twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_payment_intent_id
  ON credit_transactions (stripe_payment_intent_id);

-- Optimize user-scoped transaction history queries.
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id_created_at
  ON credit_transactions (user_id, created_at DESC);