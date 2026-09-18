-- Add the interviews.booking_channel channel discriminator as a backward-compatible,
-- nullable column with a CHECK constraint. The NOT NULL contraction is owned by a
-- later story; this migration adds no database default and performs no backfill.

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS booking_channel TEXT;

-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`; guard with a catalog check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'interviews'::regclass AND conname = 'interviews_booking_channel_check'
  ) THEN
    ALTER TABLE interviews
      ADD CONSTRAINT interviews_booking_channel_check
      CHECK (booking_channel IS NULL OR booking_channel IN ('ai_direct', 'standard_match', 'verified_interviewer'));
  END IF;
END
$$;

-- Partial index to accelerate backfill, readiness checks, and the NOT NULL
-- contraction migration. All three query WHERE booking_channel IS NULL;
-- without this index each run triggers a full sequential scan.
CREATE INDEX IF NOT EXISTS idx_interviews_booking_channel_null
  ON interviews(id)
  WHERE booking_channel IS NULL;
