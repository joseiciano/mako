# Shared-backend package

This package is for logic that exists within multiple backend related applications.

## General Practices

Reference `../../docs/coding/backend-instructions.md` for general instructions when working on backend related code

## ID Generation

Generate UUIDs in application code using `crypto.randomUUID()` rather than relying on database defaults. This is a codebase policy: it keeps Better Auth aligned with our schema, avoids database-generated defaults, and ensures IDs are available before insertion.
