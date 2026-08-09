-- Contract interviews.booking_channel to NOT NULL after Story 7.10 deployment and worker drain.
-- Requires a clean fleet (zero NULL booking_channel rows). Aborts if any null remains.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM interviews WHERE booking_channel IS NULL
  ) THEN
    RAISE EXCEPTION 'booking_channel nulls remain';
  END IF;
END $$;

ALTER TABLE interviews
  ADD CONSTRAINT interviews_booking_channel_not_null_check
  CHECK (booking_channel IS NOT NULL) NOT VALID;

ALTER TABLE interviews
  VALIDATE CONSTRAINT interviews_booking_channel_not_null_check;

SET LOCAL lock_timeout = '2s';

ALTER TABLE interviews
  ALTER COLUMN booking_channel SET NOT NULL;

ALTER TABLE interviews
  DROP CONSTRAINT interviews_booking_channel_not_null_check;
