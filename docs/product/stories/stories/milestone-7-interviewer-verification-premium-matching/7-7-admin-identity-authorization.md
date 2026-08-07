# Story 7.7: Admin Identity & Authorization

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Introduce the server-owned `user.isAdmin` boolean flag (Better Auth additional field) that identifies app owners and trusted moderators with identical MVP review permissions, persist it via a versioned SQL migration, expose it on the canonical session, and add a `requireAdmin` guard plus a least-privilege operational runbook. Granular roles are out of scope.
**Status**: Todo

## What Needs to Be Done

### 1. SQL Migration for the `isAdmin` Column
- [ ] Create a versioned SQL migration in `packages/shared-backend/migrations/*.sql` using the documented commands in `docs/system/system-design/db-schemas.md`: `pnpm db:migration:create -- <migration_name>` to scaffold the file, then apply with `DATABASE_URL=<postgres_connection_string> pnpm db:migrate`.
- [ ] The migration adds `"isAdmin" BOOLEAN NOT NULL DEFAULT FALSE` to the `"user"` table referenced in `docs/system/system-design/db-schemas.md`, so all existing rows default to non-admin and only the server may set the value.
- [ ] Keep the migration idempotent/versioned in `schema_migrations` per the migration system documented in `docs/product/stories/stories/milestone-1-foundation-authentication/1-3-database-migration-system.md`.
- [ ] Add a test asserting the migration applies cleanly and new/`DEFAULT FALSE` rows have `isAdmin = false`, and that `isAdmin` cannot be written through any client-facing path.

### 2. Better Auth Additional Field
- [ ] In `packages/shared-backend/src/auth/auth-config.ts`, register `isAdmin` under `betterAuth({ user: { additionalFields: { isAdmin: { type: 'boolean', required: true, defaultValue: false, input: false, returned: true } } } })` so it is never writable by the client through auth endpoints; only the server may set it.
- [ ] Confirm this single `user.additionalFields.isAdmin` config makes `isAdmin` present on the user object returned from `GET /api/auth/get-session` and `POST /api/auth/sign-in`. Do not invent a second session configuration or duplicate session-level config for this flag.
- [ ] Strongly type `BetterAuthSessionUser` in `packages/shared-backend/src/auth/auth-config.ts` to include `isAdmin: boolean`, and add runtime validation so a missing or non-boolean `isAdmin` is treated as `false` (fail closed) rather than trusted.
- [ ] Keep `AccountProfile` (the `/api/account` profile shape) from becoming the admin authorization source; the session `user.isAdmin` is canonical for authorization decisions.

### 3. Frontend Auth Client Typing
- [ ] Configure `packages/shared-frontend/src/auth/auth-client.ts` so the `AuthClientUser` session type infers/manually declares `isAdmin: boolean` from the backend `user.additionalFields.isAdmin`, matching the backend contract.
- [ ] If `better-auth` is currently pinned to `latest` in `packages/shared-frontend`, pin it to the same version used by the backend application so the additional-field types align; do not use `latest`.
- [ ] Add a frontend type test asserting `AuthClientUser.isAdmin` is present and typed `boolean`.

### 4. requireAdmin Middleware
- [ ] Implement `packages/shared-backend/src/auth/require-admin.ts` as a Hono middleware that consumes the existing auth context/session (from `packages/shared-backend/src/auth/auth-middleware.ts`) without performing a separate Better Auth lookup.
- [ ] Return `401` for unauthenticated requests; return `403` when the authenticated user is present but `isAdmin !== true` (including a missing or non-boolean flag per the fail-closed runtime validation); pass the request through when `isAdmin === true`.
- [ ] Ensure no auth/demo fallback may grant admin; authorization always fails closed unless the canonical session reports `isAdmin === true`.
- [ ] Add tests covering unauthenticated → `401`, non-admin → `403`, missing/invalid `isAdmin` flag → `403`, and admin → pass.
- [ ] Add a revoke-next-request integration test: with an active admin session, revoke `isAdmin` in the database, then assert the very next request through the `requireAdmin` middleware fails closed (non-admin `403`); a subsequent request after session revocation/expiry returns `401`. This proves authorization is re-evaluated from the canonical session on each request rather than cached from the login-time value.

### 5. Operational Runbook for Manual Admin Assignment
- [ ] Create `docs/operations/admin-access.md` documenting that admin assignment is manual SQL only, with least-privilege instructions to grant and revoke admin status.
- [ ] The runbook must include a grant SQL snippet and a revoke SQL snippet. Each is a single `UPDATE "user" SET ... WHERE id = '<user_uuid>'` statement that sets both `"isAdmin"` (`true` to grant, `false` to revoke) and `"updatedAt" = NOW()` in the same statement, and identifies the target row by the user's UUID. No partial or separate `updatedAt` update is permitted.
- [ ] The runbook must include a verification query confirming the resulting `"isAdmin"` value and an explicit statement that there is no public/admin-management endpoint — admins are assigned and revoked only through this operational SQL, not through the application.

### 6. Schema & Documentation Updates
- [ ] Update `docs/system/system-design/api-routes.md` to document that the canonical Better Auth session `user` carries the server-owned `isAdmin: boolean` field (default `false`, never client-writable through auth endpoints), and that admin-protected routes authorize exclusively from this session value.
- [ ] Update the `"user"` section of `docs/system/system-design/db-schemas.md` to document the new `"isAdmin"` boolean column (default `false`, server-owned, no client write path).
- [ ] Update `docs/product/stories/milestones.md` (Admin Review area) to reflect that admin identity is a single server-owned boolean with no granular roles in scope for this milestone.

## Implementation Notes
- Only a single server-owned `isAdmin` boolean exists; it represents app owners and trusted moderators with identical MVP review permissions. Granular role systems are explicitly out of scope.
- No public or admin-management endpoint is created; admin status changes are performed manually via the documented SQL runbook in `docs/operations/admin-access.md`.
- No runtime OpenAPI/Swagger annotations are added here and no partial per-feature generated annotation is introduced. API documentation stays in exact Markdown plus the shared Zod schemas and contract tests, until repository-wide tooling exists that would generate annotations consistently across features; no single-feature annotation convention is claimed.
- Raw SQL via Hyperdrive is used; no ORM is introduced.

## End Goal
A user's admin status is a single server-owned `"isAdmin"` boolean persisted by migration, returned on the canonical Better Auth session from a single additional-field config, strongly typed on the backend and frontend, and protected by a `requireAdmin` middleware that fails closed (401 unauthenticated, 403 non-admin). Admins are granted/revoked only through a documented least-privilege operational runbook, and no client can set or escalate the flag.
