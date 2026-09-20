# Email Verification with Cloudflare Email Service

## Goal

Require email verification for new email/password accounts. Better Auth and its Postgres database remain authoritative for users, credentials, verification state, and sessions. Cloudflare Email Service is used exclusively to deliver Better Auth verification messages through the native Worker `EMAIL` binding.

## Architecture and ownership

### Better Auth and Postgres

Better Auth owns:

- User IDs, names, and normalized email addresses.
- Credential accounts and password hashes.
- `user.emailVerified` as the authoritative verification state.
- Session records and session cookies.
- Verification-link generation, signature validation, and expiration semantics.

Better Auth `1.5.6` uses a signed, expiring, stateless token for its built-in email-verification flow. It does not persist that token in the `verification` table. The presence of the generic `verification` table does not make the built-in token revocable or strictly single-use.

### Cloudflare Email Service

Cloudflare Email Service owns:

- Sending-domain configuration and managed DNS records.
- Message acceptance, queueing, and delivery.
- Bounce, suppression, and provider delivery telemetry.

Cloudflare Email Service is not a user, credential, verification-state, token, or session store.

### Backend Worker

`backend-rest` bridges the two systems. It receives the Better Auth-generated recipient and verification URL, renders the transactional message, and sends it through the `EMAIL` binding. It must not persist duplicate user or verification state.

Use the native Worker binding. Do not use the Email Service REST API or give the Worker an email API token.

## Product and failure contract

- Signup creates an unverified Better Auth user but no usable authenticated session.
- The frontend navigates to a generic “Check your email” screen after a successful or enumeration-safe synthetic signup response.
- Email delivery is scheduled on the current request with `executionCtx.waitUntil()`.
- Missing required runtime configuration fails closed with `503` before Better Auth creates an account.
- A provider rejection after account creation does not roll back the account. The account remains safely unusable until verified.
- A correct-password sign-in for an unverified account sends a fresh verification email and returns Better Auth’s structured `EMAIL_NOT_VERIFIED` error.
- Clicking a valid link sets `user.emailVerified = true` and redirects to the frontend login page.
- Expired and invalid links redirect to the login page with a typed error state.
- Verification does not automatically sign the user in; the user signs in normally afterward.
- No Resend dependency, API key, or runtime path is introduced.

`EMAIL.send()` acceptance is not proof of mailbox delivery. The application guarantees configuration readiness and recovery, not atomic account creation plus email delivery.

## Privacy contract

- Recipient addresses, verification URLs, tokens, and message bodies must not appear in application logs, Worker invocation logs, or Email Service message previews.
- Backend Worker observability must redact query strings because verification tokens are query parameters.
- Better Auth logging must be disabled or redacted so it cannot emit email addresses.
- Adapter failures may log only allowlisted provider error codes and non-sensitive operational metadata.
- `preview_enabled` remains false.
- Cloudflare Email Service necessarily retains recipient delivery metadata in its operational delivery, bounce, and suppression systems. The no-PII logging guarantee does not apply to those provider-controlled records.

## Current repository state

- `packages/shared-backend/src/auth/auth-config.ts` enables email/password authentication but does not configure email verification.
- `apps/frontend/src/routes/auth/signup/signup-smart.tsx` treats signup as immediate authentication and redirects to `/dashboard`.
- `packages/shared-backend/migrations/20260425120000_add_better_auth_schema.sql` already contains `user.emailVerified` and the core Better Auth tables.
- No database migration is required for Better Auth’s built-in verification state. A migration is required if Better Auth database-backed rate limiting is enabled.
- `apps/backend-rest/wrangler.jsonc` has no `send_email` binding.
- Terraform owns persistent resources and bindings; committed Wrangler configuration mirrors those bindings for application deployment and local development.
- Staging and production use separate Cloudflare accounts and Terraform state.
- The pinned Cloudflare provider `5.25.0` supports `cloudflare_email_sending_subdomain` and `send_email` Worker bindings.

# Implementation plan

## Phase 1: Establish the environment and policy contract

Define independently for staging and production:

- `EMAIL_SENDING_ZONE_ID`
- `EMAIL_SENDING_DOMAIN`
  - Example production: `mail.example.com`
  - Example staging: `mail.staging-example.com`
- Derived sender: `noreply@${EMAIL_SENDING_DOMAIN}`

The zone ID must identify a Cloudflare zone that contains the configured sending domain. Because staging and production use separate accounts, each account must own a containing zone or a genuinely delegated subdomain zone. Do not assume one zone can be managed by both accounts.

Prerequisites:

- Both sending domains use Cloudflare DNS.
- Both accounts use Workers Paid if mail must reach arbitrary recipients.
- The Terraform/CI Cloudflare token has Email Sending edit access for the selected zone in addition to its existing Worker permissions.
- `CLOUDFLARE_RUNTIME_API_TOKEN` does not need Email Sending permissions because the Worker binding handles authorization.

Store zone IDs and domains as GitHub environment variables rather than secrets. They are public configuration values, so the existing secret setup scripts do not need new entries.

Adopt these policy decisions:

- Verification token expiry: one hour.
- Verification does not auto-sign in.
- Delivery runs in the background with `waitUntil()`.
- Correct-password sign-in is the initial resend mechanism; do not add a separate public resend endpoint.
- Unverified password accounts are retained for 30 days, subject to the cleanup constraints in Phase 7.

## Phase 2: Provision Cloudflare Email Service with Terraform

### `infrastructure/variables.tf`

Add required variables with non-empty and domain-shape validation:

```hcl
variable "email_sending_zone_id" {
  type        = string
  description = "Cloudflare zone containing the Email Sending domain."
}

variable "email_sending_domain" {
  type        = string
  description = "Environment-specific domain onboarded for Email Sending."
}
```

Derive the sender address in `locals`:

```hcl
auth_email_from = "noreply@${var.email_sending_domain}"
```

Do not add a secret for this address.

### `infrastructure/main.tf`

Add the Email Sending resource:

```hcl
resource "cloudflare_email_sending_subdomain" "auth" {
  zone_id                    = var.email_sending_zone_id
  name                       = var.email_sending_domain
  preview_enabled            = false
  drop_suppressed_recipients = false
}
```

Keeping `drop_suppressed_recipients` false ensures a suppressed recipient produces a failure rather than a misleading successful send result.

Do not independently create `cf-bounce` MX, SPF, DKIM, DMARC, or return-path records with `cloudflare_dns_record`. Cloudflare Email Service creates and manages those records, and some remain locked for the lifetime of the configuration.

Extend `cloudflare_workers_script.backend_api.bindings` with:

- A `send_email` binding named `EMAIL`.
- `allowed_sender_addresses = [local.auth_email_from]`.
- A plain-text binding named `AUTH_EMAIL_FROM` containing `local.auth_email_from`.

Add an explicit dependency on `cloudflare_email_sending_subdomain.auth` so the domain is provisioned before the backend binding is finalized.

Enable query-string redaction for backend Worker observability. The Terraform setting must be mirrored in Wrangler.

No email binding is required on:

- `notification-orchestrator`
- `frontend`
- `greedy-matcher`

Do not place verification URLs, tokens, or message bodies on the shared notification queue.

### `infrastructure/outputs.tf`

Add outputs for operator and CI readiness checks:

- `email_sending_domain`
- `auth_email_from`
- `email_sending_enabled`
- Optionally, the computed DKIM selector and return-path domain

Do not output verification tokens, recipient addresses, or message contents. Treat `email_sending_enabled` as a domain-readiness signal, not proof of delivery.

### Infrastructure documentation

Update:

- `infrastructure/README.md`
- `infrastructure/terraform.tfvars.example`
- `docs/infrastructure/management.md`
- `docs/infrastructure/backend.md`

Document Email Service as Terraform-owned persistent infrastructure and list `EMAIL` and `AUTH_EMAIL_FROM` under `backend-rest` bindings.

## Phase 3: Mirror bindings in Wrangler and CI

Continue the repository ownership convention:

- Terraform owns persistent resources and deployed bindings.
- Wrangler deploys application code and supports local development.
- Committed Wrangler bindings mirror Terraform bindings exactly.

### `apps/backend-rest/wrangler.jsonc`

Add safe local defaults:

```jsonc
{
  "vars": {
    "AUTH_EMAIL_FROM": "noreply@example.invalid"
  },
  "send_email": [
    {
      "name": "EMAIL",
      "allowed_sender_addresses": ["noreply@example.invalid"]
    }
  ]
}
```

Mirror query-string redaction in the existing observability configuration. Regenerate Wrangler binding types after adding the binding rather than maintaining a divergent handwritten binding shape where project tooling supports generation.

During ordinary `wrangler dev`, Cloudflare simulates delivery, logs the message, and saves its content to local files without sending real mail. Do not commit `"remote": true`.

### `.github/workflows/deploy-infrastructure.yml`

For both staging and production jobs:

1. Read `${{ vars.EMAIL_SENDING_ZONE_ID }}` and `${{ vars.EMAIL_SENDING_DOMAIN }}` from the matching GitHub environment.
2. Export them as `TF_VAR_email_sending_zone_id` and `TF_VAR_email_sending_domain`.
3. Validate that neither value is empty before `terraform apply`.
4. Expose and inspect the `email_sending_enabled` output after apply.

Terraform apply is provisioning, not the final readiness gate. Verification enforcement remains blocked until the domain is enabled and a controlled staging send succeeds.

### `.github/workflows/deploy-applications.yml`

Before each staging and production `backend-rest` deployment:

1. Validate `EMAIL_SENDING_DOMAIN`.
2. Derive `AUTH_EMAIL_FROM=noreply@$EMAIL_SENDING_DOMAIN`.
3. Replace both `noreply@example.invalid` occurrences in `wrangler.jsonc`.
4. Fail if either expected placeholder was absent or any placeholder remains.
5. Validate or regenerate Wrangler binding types.
6. Deploy normally with `--keep-vars`.

This keeps the Wrangler deployment and Terraform sender allowlist identical.

### CI documentation and scripts

Update `docs/system/system-design/ci-cd.md` with:

- The two environment variables.
- The required Email Sending permission on the Terraform deployment token.
- Sender-address derivation and Wrangler rendering.
- The infrastructure-readiness gate required before verification enforcement.

Do not update:

- `scripts/set-github-env-secrets.sh`
- `scripts/set-github-env-secrets-from-env.sh`

No new secret is required.

## Phase 4: Add the Cloudflare email adapter

Create a focused Worker-side adapter, for example:

```text
apps/backend-rest/src/auth-verification-email.ts
```

Responsibilities:

- Accept the recipient and Better Auth-generated verification URL.
- Call `EMAIL.send()` through Cloudflare’s structured Worker API.
- Include both HTML and plain-text bodies.
- Use `AUTH_EMAIL_FROM` as the sender address and `Mako` as the sender name.
- Use a clear verification subject.
- HTML-escape the URL before placing it in an attribute, including escaping `&` as `&amp;`.
- Do not interpolate user-controlled names into HTML unless they are escaped.
- Never log recipient addresses, message bodies, tokens, or URLs.
- Emit structured success and failure events containing only allowlisted safe metadata.
- Do not log raw provider messages.

Schedule the send promise with the current request’s `executionCtx.waitUntil()`. The promise must always be passed to `waitUntil`; it must not float and must not be registered a second time through another background-task layer.

This is intentionally best-effort background delivery. A provider rejection is observable but does not roll back the unverified Better Auth user.

## Phase 5: Make Better Auth request-safe and enforce verification

### `packages/shared-backend/src/auth/auth-config.ts`

Extend `CreateBetterAuthOptions` with a provider-independent callback:

```ts
type SendVerificationEmail = (input: {
  email: string
  url: string
}) => Promise<void>
```

Keep Cloudflare-specific types out of the shared Better Auth configuration.

Configure:

```ts
emailVerification: {
  expiresIn: 60 * 60,
  sendOnSignUp: true,
  sendOnSignIn: true,
  autoSignInAfterVerification: false,
  sendVerificationEmail: options.sendVerificationEmail,
},
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
},
rateLimit: {
  enabled: true,
  storage: "database",
},
advanced: {
  ipAddress: {
    ipAddressHeaders: ["cf-connecting-ip"],
  },
},
```

Configure Better Auth logging so signup and sign-in cannot emit email addresses or verification URLs. Prefer disabling Better Auth’s default logger or routing it through an explicit redacting logger rather than attempting to sanitize arbitrary strings after logging.

The current global auth cache must not store any instance containing a request-specific callback. `JSON.stringify` omits functions, so a serialized cache key cannot distinguish callbacks and could retain the first request’s execution context.

For `/api/auth/*`, construct Better Auth for the current request and do not put that instance in `authCache`. Static configuration may remain reusable only when it cannot retain request-scoped state.

### Better Auth rate-limit migration

Add the Better Auth rate-limit table required by database-backed rate limiting using the repository’s direct SQL migration convention. This table contains operational rate-limit state, not a second copy of user profile data.

Do not rely on Better Auth’s in-memory rate-limit storage in a distributed Worker deployment.

### `apps/backend-rest/src/index.ts`

- Use generated Worker binding types where available; otherwise extend the existing binding type with `EMAIL` and `AUTH_EMAIL_FROM` without unsafe casts.
- Make `createWorkerAuth()` return `503` before invoking Better Auth if any of these are unavailable:
  - `HYPERDRIVE`
  - `BETTER_AUTH_SECRET`
  - `EMAIL`
  - `AUTH_EMAIL_FROM`
- Capture the current Hono execution context and pass a request-specific verification callback into Better Auth.
- Skip auth-session middleware for `/api/auth/*`, since Better Auth owns those endpoints.
- Update missing-runtime-configuration responses and structured logs without exposing configuration values.

Missing runtime configuration prevents account creation. A later provider rejection does not; it leaves the account unverified and recoverable through correct-password sign-in.

Update any stale missing-configuration message in `packages/shared-backend/src/auth/auth-controller.ts`.

## Phase 6: Update the frontend verification flow

### Preserve structured errors

Update `apps/frontend/src/routes/auth/shared/auth-flow.ts` so conversion from Better Auth results preserves at least:

- `code`
- `message`
- `status`

Use a typed application error rather than reducing every response to a plain `Error`. Login behavior must use `code === "EMAIL_NOT_VERIFIED"`, optionally together with status `403`, rather than provider message wording.

### Signup

Update `apps/frontend/src/routes/auth/signup/signup-smart.tsx`:

- Pass an absolute frontend callback URL to `authClient.signUp.email()`, for example `new URL("/login?verified=true", window.location.origin).toString()`.
- Ensure the frontend origin is included in `BETTER_AUTH_TRUSTED_ORIGINS`.
- On successful or enumeration-safe synthetic signup, do not call `handleAuthSuccess()`.
- Navigate to `/verify-email`.
- Do not invalidate the session query or navigate to `/dashboard`.

Add:

```text
apps/frontend/src/routes/verify-email.tsx
apps/frontend/src/routes/auth/verify-email/verify-email-dumb.tsx
```

Use enumeration-safe copy:

> If the address is eligible, check your inbox for a verification link. Delivery may take a few minutes. If you already have an account, sign in with the correct password to request a fresh link.

The screen must not:

- State unconditionally that an account was created or an email was sent.
- Display the submitted email address.
- Put the email address in the URL.
- Branch on synthetic signup response fields.

Link back to `/login`.

### Login

Add typed search validation for `verified` and `error`. Support only known values and never render arbitrary query text.

Behavior:

- `verified=true`: show a success banner and allow normal login.
- `error=TOKEN_EXPIRED`: show expired-link guidance.
- `error=INVALID_TOKEN`: show invalid-link guidance.
- If success and error are both present, the error takes precedence.
- `EMAIL_NOT_VERIFIED`: explain generically that verification is required and, if the credentials were correct and the account is eligible, a fresh link was sent.
- Other authentication errors retain existing generic behavior.

Do not add a separate public resend endpoint in this change.

### API documentation

Update `docs/system/system-design/api-routes.md`:

- Correct Better Auth email endpoints to `/sign-up/email` and `/sign-in/email` where necessary.
- Document signup as returning an unverified user with `token: null`, not a usable session.
- Document enumeration-safe duplicate-signup behavior.
- Document verification redirects, invalid/expired error redirects, and unverified-sign-in behavior.
- Document that delivery is asynchronous and provider rejection does not roll back an unverified account.

## Phase 7: Retention and operations

Adopt a 30-day retention policy for never-verified email/password accounts.

Cleanup must:

- Select only unverified users associated with password credentials.
- Avoid deleting social-provider users based only on `emailVerified`.
- Delete dependent credential data transactionally according to the existing schema.
- Be idempotent and observable without logging email addresses.
- Document that verification links stop working after account deletion.

If the repository has no suitable scheduled cleanup pattern, document the retention gap and ship automation separately rather than adding an unreviewed scheduler to the verification deployment.

Add operational metrics or alerts for:

- Provider send rejection.
- Rate-limit exceeded.
- Daily Email Service limit exceeded.
- Recipient suppressed.
- Invalid sender or sending domain.
- Missing runtime binding or configuration.
- Background send-promise rejection.

A provider `messageId` indicates acceptance or queueing, not delivery.

## Phase 8: Permanent tests

Add or update tests only for observable contracts.

### Better Auth behavior

- Signup creates an unverified user and no session token.
- Unverified users cannot sign in.
- Correct-password unverified sign-in triggers a replacement verification email and preserves `EMAIL_NOT_VERIFIED`.
- Verification marks `user.emailVerified` and does not auto-sign in.
- Verification tokens expire according to the explicit one-hour setting.
- Two requests with distinct execution contexts register sends with their respective contexts; no request-specific callback is retained.

### Worker email adapter

- Sends to the correct recipient through the configured binding.
- Uses the configured sender.
- Produces HTML and plain-text content.
- Escapes the URL in HTML.
- Registers the send promise with the current request’s `waitUntil` exactly once.
- Provider failures are logged without recipient addresses, URLs, tokens, bodies, or raw provider messages.

### Runtime configuration

- Missing `EMAIL` returns `503` before account creation.
- Missing `AUTH_EMAIL_FROM` returns `503` before account creation.
- A provider rejection after configured signup leaves an unverified, unusable account and emits a safe failure event.

### Frontend signup

- Successful and synthetic signup responses navigate to `/verify-email`.
- Signup does not navigate to `/dashboard` or invalidate the session query.
- API and validation errors remain visible.
- The verification screen uses enumeration-safe copy.

### Frontend login

- Verified login navigates normally.
- `EMAIL_NOT_VERIFIED` displays generic verification guidance.
- `verified=true` displays the success banner.
- Invalid or expired token errors override the success banner.
- Arbitrary query-string error text is never rendered.

## Phase 9: Verification

### Local smoke test

Using normal `wrangler dev` without `remote: true`:

1. Start the local Postgres/test stack.
2. Create a new email/password account.
3. Confirm no authenticated session is created.
4. Confirm Wrangler simulates and saves the verification email without delivering real mail.
5. Extract and open the generated verification URL.
6. Confirm `emailVerified` changes to true.
7. Confirm verification does not create a session.
8. Sign in and confirm normal authentication succeeds.
9. Confirm no real email was delivered.

### Infrastructure readiness

For each environment:

```text
terraform validate
terraform plan
terraform apply
```

Then confirm:

- `cloudflare_email_sending_subdomain.auth.enabled` is true.
- Cloudflare shows valid SPF, DKIM, DMARC, and return-path records.
- Terraform and Wrangler produce no binding drift.
- `backend-rest` has `EMAIL` and `AUTH_EMAIL_FROM` bindings.
- The sender allowlist exactly matches the configured sender.
- Query-string redaction is enabled in both Terraform and Wrangler.
- A controlled staging send is accepted before verification enforcement is promoted.

### Staging end-to-end verification

Using unique controlled inboxes:

1. Register a new account and confirm no dashboard session is created.
2. Receive and open the verification email.
3. Confirm verification redirects to the frontend login route.
4. Confirm the user can sign in after verification.
5. Test expired and invalid links and confirm they never show success.
6. Attempt correct-password login for an unverified account and confirm a replacement email arrives.
7. Confirm duplicate signup remains enumeration-safe.
8. Exercise a provider rejection or suppression and confirm it is observable while the account remains unverified.
9. Confirm two concurrent requests cannot cross-wire execution contexts or email sends.
10. Confirm application and Worker logs contain no recipient address, verification URL, token, message body, or unredacted query string.

# Rollout order

Use separate deployment increments or an explicit manual promotion gate. The infrastructure and application workflows have independent triggers and must not be assumed to execute in order.

## Deployment A: infrastructure readiness

- Terraform Email Sending domain.
- Cloudflare-managed DNS onboarding.
- `EMAIL` and `AUTH_EMAIL_FROM` bindings.
- Sender restrictions and suppressed-recipient behavior.
- Query-string redaction.
- Wrangler and CI parity.
- Local simulation.
- Enabled-domain check and controlled staging delivery.
- No Better Auth verification policy change.

Deployment A is complete only after the domain reports enabled, DNS records are valid, the controlled send succeeds, and Terraform/Wrangler show no binding drift.

## Deployment B: verification enforcement

- Request-scoped Better Auth construction.
- Cloudflare email adapter and safe observability.
- Database-backed Better Auth rate limiting and its migration.
- Verification enforcement and one-hour token expiry.
- Signup, verification, and login frontend changes.
- Tests and documentation.
- Staging end-to-end verification.
- Production canary with a controlled inbox.

Coordinate backend and frontend promotion because the old frontend treats a successful signup as authenticated. Do not deploy enforcement before Deployment A passes its readiness gate.

# Definition of done

- Better Auth/Postgres is the sole authoritative store for users, credentials, verified-email state, and sessions.
- New email/password accounts receive no usable session and cannot sign in until verified.
- Better Auth generates and validates the signed, one-hour verification token.
- Verification messages are delivered exclusively through the Cloudflare Worker `EMAIL` binding.
- Missing runtime email configuration returns `503` before account creation.
- Provider failures leave accounts unverified and recoverable through correct-password sign-in.
- Local development sends no real email by default.
- Staging and production sending domains are independently Terraform-managed.
- Terraform and Wrangler binding and observability definitions remain drift-free.
- Application logs, Worker logs, and message previews contain no recipient addresses, verification URLs, tokens, or message bodies.
- Duplicate signup and unverified sign-in behavior do not disclose account existence.
- Invalid and expired links cannot display a verification-success state.
- Distributed rate limiting protects signup, sign-in, and verification-email generation.
- The 30-day unverified-account retention policy is documented, with automation implemented or the operational gap explicitly recorded.
- No Resend dependency, API key, or runtime path exists.

# References

- [Cloudflare Email Sending domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)
- [Cloudflare Email Service Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- [Cloudflare local email simulation](https://developers.cloudflare.com/email-service/local-development/sending/)
- [Cloudflare send-binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Cloudflare Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)
- [Cloudflare Email Service logs](https://developers.cloudflare.com/email-service/observability/logs/)
- [Cloudflare Email Service suppressions](https://developers.cloudflare.com/email-service/concepts/suppressions/)
- [Cloudflare Workers `waitUntil`](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)
- [Better Auth email verification](https://better-auth.com/docs/concepts/email)
- [Cloudflare Terraform provider `email_sending_subdomain` resource](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.25.0/docs/resources/email_sending_subdomain.md)
