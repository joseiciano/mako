# Admin Access Runbook

Admin status is a single server-owned boolean, `"user"."isAdmin"` (default `false`). App owners and trusted moderators share identical MVP review permissions; there are no granular roles.

There is no public or admin-management endpoint. Admins are assigned and revoked only through the operational SQL below, never through the application. Better Auth registers `isAdmin` with `input: false`, so no client request can set it.

## Least-Privilege Rules

- Run these statements with a database role that has `UPDATE` on `"user"` only for the duration of the change. Do not use a superuser or the application runtime role.
- Identify the target row by the user's UUID (`"user".id`), never by email pattern or a bulk `WHERE`.
- Run one statement per user. Record who was granted or revoked and why in the operations log.
- Always set `"updatedAt" = NOW()` in the same statement as `"isAdmin"`.

## Grant

```sql
UPDATE "user" SET "isAdmin" = true, "updatedAt" = NOW() WHERE id = '<user_uuid>';
```

## Revoke

```sql
UPDATE "user" SET "isAdmin" = false, "updatedAt" = NOW() WHERE id = '<user_uuid>';
```

## Verify

```sql
SELECT id, email, "isAdmin", "updatedAt" FROM "user" WHERE id = '<user_uuid>';
```

Expect exactly one row with `"isAdmin"` equal to `true` after a grant and `false` after a revoke.

## Effect on Sessions

`requireAdmin` reads `isAdmin` from the canonical Better Auth session on every request. A revoke takes effect on the user's next request (`403`); no sign-out is required. A user whose session is revoked or expired receives `401`.
