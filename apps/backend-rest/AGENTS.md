# Backend REST API

This directory holds the REST API backend for Mako.

## General Practices

- All changes **MUST** follow `../../docs/coding/backend-instructions.md` and `../../docs/infrastructure/backend.md`.

## ID Generation

Generate UUIDs in application code using `crypto.randomUUID()` rather than relying on database defaults. This is a codebase policy: it keeps Better Auth aligned with our schema, avoids database-generated defaults, and ensures IDs are available before insertion.
