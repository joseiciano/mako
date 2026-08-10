# Shared-backend package

This package is for logic that exists within multiple backend related applications.

## General Practices

Reference `../../docs/coding/backend-instructions.md` for general instructions when working on backend related code

## ID Generation

Generate UUIDs in application code using `crypto.randomUUID()` rather than relying on database defaults. This is a codebase policy: it keeps Better Auth aligned with our schema, avoids database-generated defaults, and ensures IDs are available before insertion.

## R2 Artifact Storage

The `src/interview-assets` module is the canonical abstraction for R2 artifact storage. It defines:

- `ArtifactStoragePort` / `R2BucketPort` port interfaces for storage operations
- Key prefix conventions: `interviews/{interviewId}/recording/` and `interviews/{interviewId}/screenshots/`
- Content-type and size allowlists (PNG only, 5MB screenshot cap)
- 30-day R2 lifecycle expiration on all artifact buckets

Future stories (5.16/5.17) that need artifact retrieval or new upload endpoints should reuse this module rather than writing ad-hoc R2 code.
