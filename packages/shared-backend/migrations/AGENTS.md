# Database Practices

## Migration File Formatting

- **Use Timestamp Naming**: Migration files should be named: `YYYYMMDDHHmmss_feature`

## Best Practices

- **Text Over Enums**: Do not use enums in DB migrations. Instead, use text with a CHECK constraint.
- **Do Not Set default IDs, Created, or Updated Timestamp**: For fields like UUIDs, Created timestamps, deleted timestamps, or updated timestamps, **do not** set them by default. Assume we must set them in the code layer.
- **Backwards Compatibility**: Refer to previous migrations to know if we are making something new or if we need to worry about backwards compatibility.

## Documentation

Migrations should also have check `../../../docs/system/system-design/db-schemas.md`. If the corresponding change isn't in the file, include an update to the schema file. Make sure to include things like indexes, triggers, foreign keys.
