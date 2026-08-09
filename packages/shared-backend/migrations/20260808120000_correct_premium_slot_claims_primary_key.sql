-- Safe forward corrective migration: premium_slot_claims uses idempotency_key as PK, no surrogate id.
-- The original 20260807160000 migration created premium_slot_claims with a surrogate `id UUID PRIMARY KEY`.
-- This migration removes the surrogate key and promotes idempotency_key to PRIMARY KEY,
-- preserving the existing slot_id UNIQUE and interview_id UNIQUE constraints and all data.
-- Precondition: idempotency_key is already NOT NULL and has no duplicate values.
-- No foreign keys reference premium_slot_claims(id), so dropping the column is safe.

DO $$
BEGIN
  -- Only run if the table was created by the original migration (surrogate id exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'premium_slot_claims' AND column_name = 'id'
  ) THEN
    -- Drop the old primary key constraint on surrogate id
    ALTER TABLE premium_slot_claims DROP CONSTRAINT IF EXISTS premium_slot_claims_pkey;

    -- Drop the redundant unique constraint on idempotency_key (it will become PK)
    ALTER TABLE premium_slot_claims DROP CONSTRAINT IF EXISTS premium_slot_claims_idempotency_key_key;

    -- Promote idempotency_key to primary key
    ALTER TABLE premium_slot_claims ADD CONSTRAINT premium_slot_claims_pkey PRIMARY KEY (idempotency_key);

    -- Drop the surrogate id column
    ALTER TABLE premium_slot_claims DROP COLUMN IF EXISTS id;
  END IF;
END $$;
