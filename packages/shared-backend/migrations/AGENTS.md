# Database Practices

## Migration File Formatting

- **Use Timestamp Naming**: Migration files should be named: `YYYYMMDDHHmmss_feature`

## Best Practices

- **Text Over Enums**: Do not use enums in DB migrations. Instead, use text with a CHECK constraint.
- **Do Not Set default IDs, Created, or Updated Timestamp**: For fields like UUIDs, Created timestamps, deleted timestamps, or updated timestamps, **do not** set them by default. Assume we must set them in the code layer.
- **Generate UUIDs in Application Code**: Always generate UUIDs in the application layer using `crypto.randomUUID()` rather than database defaults or `gen_random_uuid()`. This is a codebase policy: it keeps Better Auth aligned with our schema, avoids database-generated defaults, and ensures IDs are available before insertion.
- **Backwards Compatibility**: Refer to previous migrations to know if we are making something new or if we need to worry about backwards compatibility.

## Documentation

Migrations should also have check `../../../docs/system/system-design/db-schemas.md`. If the corresponding change isn't in the file, include an update to the schema file. Make sure to include things like indexes, triggers, foreign keys.

## Booking Channel Backfill Workflow

The `interviews.booking_channel` column was added as nullable and must be contracted to NOT NULL via a three-step deployment workflow:

1. **Backfill**: Run `packages/shared-backend/scripts/backfill-booking-channel.mjs` to populate NULL rows in bounded batches with short statement/lock timeouts.
2. **Readiness Gate**: Run `packages/shared-backend/scripts/check-booking-channel-readiness.mjs` to verify zero NULL rows remain before the contraction migration.
3. **NOT NULL Contraction**: Apply the contraction migration only after the readiness gate passes and the fleet is confirmed drained of any Worker version that omits `booking_channel` writes.

This ordering must never be reordered or skipped.

## Migration Runner Phasing

The standard migration runner (`run-migrations.mjs`) applies all pending migrations in one sequential pass. The booking-channel workflow (backfill → readiness → contraction) requires manual phasing because the contraction migration raises `RAISE EXCEPTION 'booking_channel nulls remain'` when pre-existing rows still have NULL values.

**Phasing procedure:**

1. Apply migrations up to and including the nullable-column migration (`20260807150000_add_interviews_booking_channel.sql`) but NOT the NOT NULL contraction.
2. Run `packages/shared-backend/scripts/backfill-booking-channel.mjs` to populate NULL rows.
3. Run `packages/shared-backend/scripts/check-booking-channel-readiness.mjs` to verify zero NULL rows.
4. Apply the NOT NULL contraction migration only after the readiness gate passes.

On a fresh deploy where no pre-existing rows have NULL `booking_channel`, all migrations can be applied in one pass since the backfill finds zero rows and the contraction succeeds immediately.
