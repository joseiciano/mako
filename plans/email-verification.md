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
- Terraform owns persistent non-Worker infrastructure and Worker identity/observability settings through `cloudflare_worker`, including backend query-string redaction. It creates one bootstrap version/deployment for a fresh Worker; Wrangler owns subsequent application versions, bindings, triggers, and deployments.
- Staging and production use separate Cloudflare accounts, Terraform state, GitHub Environments, and environment-scoped configuration.
- Cloudflare provider `5.25.0` exposes query-string redaction through the split `cloudflare_worker` resource. The legacy `cloudflare_workers_script` resource and Wrangler `4.73.0` do not expose that setting.

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
- The environment-scoped CI token `CLOUDFLARE_API_TOKEN` has Email Sending edit access for the selected zone in addition to its Terraform and Wrangler permissions.
- `CLOUDFLARE_RUNTIME_API_TOKEN` remains a separate runtime-only credential and does not need Email Sending permissions because the Worker binding handles authorization.

Store zone IDs, domains, and the enforcement flag as GitHub environment variables rather than secrets. They are public configuration values, so the existing secret setup scripts do not need new entries.

Each environment defines the non-secret variable `AUTH_EMAIL_VERIFICATION_ENFORCED` as the exact string `false` for Deployment A and `true` only for the enforcement rollout. The committed local Wrangler default is `false`; missing or differently cased values are invalid. The application workflow maps the same validated value into the frontend build as `VITE_AUTH_EMAIL_VERIFICATION_ENFORCED` so signup behavior and backend enforcement switch together.

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

Add the initial bootstrap version's bindings through `cloudflare_worker_version`:

- A `send_email` binding named `EMAIL`.
- `allowed_sender_addresses = [local.auth_email_from]`.
- A plain-text binding named `AUTH_EMAIL_FROM` containing `local.auth_email_from`.

Create the backend identity and set `observability.redact_query_string = true` with `cloudflare_worker`. Create one initial code-and-binding version through `cloudflare_worker_version` and deploy it through `cloudflare_workers_deployment`; those version/deployment resources are bootstrap-only. After bootstrap, Wrangler owns application versions, bindings, triggers, and deployments, while Terraform continues to own Worker identity and observability settings.

After Wrangler deploys, the orchestrator invokes the reusable infrastructure workflow again for the same environment and commit. This settings-reconciliation apply reasserts and verifies `cloudflare_worker.observability.redact_query_string` without uploading code or replacing Wrangler's application version. A failed reconciliation blocks the deployment and verification enforcement.

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

Document Email Service and Worker identity/observability settings as Terraform-owned; document bootstrap code/bindings/deployment as create-only and list `EMAIL` and `AUTH_EMAIL_FROM` as Wrangler-owned `backend-rest` bindings after bootstrap.

## Phase 3: Bootstrap with Terraform, then deploy with Wrangler and CI

Use one explicit ownership transition:

- Terraform provisions persistent non-Worker resources and owns Worker identity and observability settings through `cloudflare_worker`.
- Terraform creates one initial code-and-binding version through `cloudflare_worker_version` and deploys it through `cloudflare_workers_deployment` solely to bootstrap a fresh Worker.
- Wrangler owns later application versions/deployments and Worker configuration, bindings, and triggers.
- Committed Wrangler configuration carries the application-facing bindings and local defaults needed for normal deployment and development.
- Query-string redaction remains a Terraform-owned identity setting. After Wrangler deployment, the orchestrator runs infrastructure settings reconciliation to reassert and verify it without replacing application code.

### `apps/backend-rest/wrangler.jsonc`

Add safe local defaults:

```jsonc
{
  "vars": {
    "AUTH_EMAIL_FROM": "noreply@example.invalid",
    "AUTH_EMAIL_VERIFICATION_ENFORCED": "false"
  },
  "send_email": [
    {
      "name": "EMAIL",
      "allowed_sender_addresses": ["noreply@example.invalid"]
    }
  ]
}
```

Regenerate Wrangler binding types after adding the bindings rather than maintaining a divergent handwritten binding shape where project tooling supports generation. Do not add unsupported `redact_query_string` configuration to Wrangler.

During ordinary `wrangler dev`, Cloudflare simulates delivery, logs the message, and saves its content to local files without sending real mail. Do not commit `"remote": true`.

### Deployment workflow contract

`.github/workflows/deploy.yml` is the only push and manual deployment entry point. It maps `staging` to the `staging` GitHub Environment and `main` to `production`, rejects manual branch/environment mismatches, and calls the reusable workflows in this order: infrastructure bootstrap/apply, applications through `needs`, then post-deploy infrastructure settings reconciliation. Every invocation uses the same required `environment` and commit SHA.

For the reusable infrastructure workflow:

1. Read `${{ vars.EMAIL_SENDING_ZONE_ID }}` and `${{ vars.EMAIL_SENDING_DOMAIN }}` from the selected GitHub Environment.
2. Export them as `TF_VAR_email_sending_zone_id` and `TF_VAR_email_sending_domain` and reject empty values before apply.
3. Authenticate Terraform with the same environment-scoped `CLOUDFLARE_API_TOKEN` used later by Wrangler; keep `CLOUDFLARE_RUNTIME_API_TOKEN` separate.
4. After apply, bounded-loop a Terraform refresh and reread `email_sending_enabled` until it becomes `true` or the retry limit is exhausted. One immediate output read is not a readiness gate.

Terraform's first apply is provisioning, not the complete promotion gate. Verification enforcement remains blocked until bounded domain readiness, a controlled staging send, and the post-application Terraform settings reconciliation all succeed.

For each staging and production backend deployment in the reusable application workflow:

1. Validate `EMAIL_SENDING_DOMAIN`, derive `AUTH_EMAIL_FROM=noreply@$EMAIL_SENDING_DOMAIN`, and require `AUTH_EMAIL_VERIFICATION_ENFORCED` to be exactly `true` or `false`.
2. Render the same enforcement value into the backend Wrangler binding and expose it to the frontend build as `VITE_AUTH_EMAIL_VERIFICATION_ENFORCED`; do not allow backend and frontend rollout states to differ.
3. Replace and validate the safe sender placeholders so the deployed sender value and allowlist match.
4. Synchronize every required Worker runtime secret before `wrangler deploy`, including `CLOUDFLARE_RUNTIME_API_TOKEN` under the Worker secret name `CLOUDFLARE_API_TOKEN`. Fresh bootstrap Workers must satisfy Wrangler's `secrets.required` before their first application deployment.
5. Deploy with the shared CI credential `CLOUDFLARE_API_TOKEN` and `--keep-vars`.
6. Return control to the orchestrator, which invokes the reusable infrastructure workflow again to reassert and verify the Terraform-owned `cloudflare_worker` query-string-redaction setting without replacing the Wrangler application version.

The selected GitHub Environment must include required `NEON_API_KEY` for Terraform and `VITE_AUTH_BASE_URL` for the frontend build. There are no separate Terraform and Wrangler CI token names.

Do not update the secret setup scripts solely for the non-secret email variables or enforcement flag.

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

Extend `CreateBetterAuthOptions` with a provider-independent callback and an explicit `emailVerificationEnforced` boolean parsed from the Worker binding:

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
  requireEmailVerification: options.emailVerificationEnforced,
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

`apps/backend-rest` must parse `AUTH_EMAIL_VERIFICATION_ENFORCED` from the exact strings `true` and `false`; any other or missing value is invalid runtime configuration. Deployment A supplies `false`, and Deployment B changes the environment variable to `true` without a code fork.

Configure Better Auth logging so signup and sign-in cannot emit email addresses or verification URLs. Prefer disabling Better Auth’s default logger or routing it through an explicit redacting logger rather than attempting to sanitize arbitrary strings after logging.

The current global auth cache must not store any instance containing a request-specific callback. `JSON.stringify` omits functions, so a serialized cache key cannot distinguish callbacks and could retain the first request’s execution context.

For `/api/auth/*`, construct Better Auth for the current request and do not put that instance in `authCache`. Static configuration may remain reusable only when it cannot retain request-scoped state.

### Better Auth rate-limit migration

Add the Better Auth rate-limit table required by database-backed rate limiting using the repository’s direct SQL migration convention. This table contains operational rate-limit state, not a second copy of user profile data.

Do not rely on Better Auth’s in-memory rate-limit storage in a distributed Worker deployment.

### `apps/backend-rest/src/index.ts`

- Use generated Worker binding types where available; otherwise extend the existing binding type with `EMAIL`, `AUTH_EMAIL_FROM`, and `AUTH_EMAIL_VERIFICATION_ENFORCED` without unsafe casts.
- Make `createWorkerAuth()` return `503` before invoking Better Auth if any of these are unavailable:
  - `HYPERDRIVE`
  - `BETTER_AUTH_SECRET`
  - `EMAIL`
  - `AUTH_EMAIL_FROM`
  - `AUTH_EMAIL_VERIFICATION_ENFORCED` unless it is exactly `true` or `false`
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

Update `apps/frontend/src/routes/auth/signup/signup-smart.tsx` and its build-time configuration so the validated GitHub Environment value drives both sides of rollout. The application workflow maps `AUTH_EMAIL_VERIFICATION_ENFORCED` to `VITE_AUTH_EMAIL_VERIFICATION_ENFORCED`, which accepts only exact `true` or `false`.

When the value is `false`, preserve the existing signup behavior: successful signup calls `handleAuthSuccess()`, updates the session, and navigates to `/dashboard`. This is the Deployment A and rollback path.

When the value is `true`:

- Pass an absolute frontend callback URL to `authClient.signUp.email()`, for example `new URL("/login?verified=true", window.location.origin).toString()`.
- Ensure the frontend origin is included in `BETTER_AUTH_TRUSTED_ORIGINS`.
- On successful or enumeration-safe synthetic signup, do not call `handleAuthSuccess()`.
- Navigate to `/verify-email` without invalidating the session query or navigating to `/dashboard`.

The frontend build must fail on a missing or invalid value rather than silently choosing a rollout state. Backend enforcement and frontend navigation therefore switch together from the same environment variable.
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

For each environment, run the orchestrated deployment with `AUTH_EMAIL_VERIFICATION_ENFORCED=false`. The infrastructure reusable workflow validates, plans, applies, then performs a bounded refresh/poll for `cloudflare_email_sending_subdomain.auth.enabled=true`; a single immediate Terraform output read is insufficient.

The same orchestrator run invokes applications only after infrastructure succeeds. Then confirm:

- Cloudflare shows valid SPF, DKIM, DMARC, and return-path records.
- `backend-rest` has the expected `EMAIL`, `AUTH_EMAIL_FROM`, and enforcement bindings after Wrangler takes ownership of the application script.
- The sender allowlist exactly matches the configured sender.
- Required Worker runtime secrets were synchronized before the Wrangler deployment.
- The final infrastructure settings-reconciliation apply reasserted and verified query-string redaction on the Terraform-owned Worker identity without replacing Wrangler's deployed version.
- A controlled staging send is accepted before verification enforcement is promoted.

If post-application settings reconciliation fails, the deployment is blocked.

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

`.github/workflows/deploy.yml` is the only deployment entry point. In each run it resolves the environment and invokes, for the same commit SHA, the reusable infrastructure bootstrap/apply, the reusable application deployment through `needs`, and a final infrastructure settings reconciliation through `needs`. Operators do not run or order those phases independently.

## Deployment A: infrastructure readiness

Set the selected GitHub Environment's `AUTH_EMAIL_VERIFICATION_ENFORCED` variable to the exact string `false`, then run the orchestrator. Deployment A covers:

- Terraform Email Sending domain and create-only Worker bootstrap.
- Cloudflare-managed DNS onboarding.
- Wrangler ownership of the application script with `EMAIL`, `AUTH_EMAIL_FROM`, and sender restrictions.
- Pre-deploy synchronization of every required Worker runtime secret.
- Bounded enabled-domain readiness polling.
- Post-application infrastructure reconciliation that reasserts and verifies the Terraform-owned `cloudflare_worker` query-string-redaction setting without replacing Wrangler's application version.
- Local simulation and controlled staging delivery.
- No Better Auth verification enforcement.

Deployment A is complete only after the bounded readiness poll succeeds, DNS records are valid, Wrangler's deployed bindings are correct, runtime secrets were present before deployment, the controlled send succeeds, and the final Terraform settings reconciliation succeeds. If reconciliation fails, Deployment A is not complete.

## Deployment B: verification enforcement

Change `AUTH_EMAIL_VERIFICATION_ENFORCED` to the exact string `true` in staging and run the orchestrator again. Deployment B covers:

- Request-scoped Better Auth construction.
- Cloudflare email adapter and safe observability.
- Database-backed Better Auth rate limiting and its migration.
- Environment-enabled verification enforcement and one-hour token expiry.
- Signup, verification, and login frontend changes.
- Tests, documentation, and staging end-to-end verification.

Promote the same configuration to production only after staging passes, set the production variable to `true`, run the orchestrator from `main`, and complete the controlled-inbox canary. Rollback sets the affected environment variable to `false` and redeploys applications while leaving the proven Email Service infrastructure in place.

# Definition of done

- Better Auth/Postgres is the sole authoritative store for users, credentials, verified-email state, and sessions.
- New email/password accounts receive no usable session and cannot sign in until verified.
- Better Auth generates and validates the signed, one-hour verification token.
- Verification messages are delivered exclusively through the Cloudflare Worker `EMAIL` binding.
- Missing runtime email configuration returns `503` before account creation.
- Provider failures leave accounts unverified and recoverable through correct-password sign-in.
- Local development sends no real email by default.
- Staging and production sending domains and Worker identity/observability settings are independently Terraform-managed; Terraform code/binding versions and deployments are create-only bootstrap resources, and Wrangler owns application versions, bindings, triggers, and deployments afterward.
- Terraform enables query-string redaction through `cloudflare_worker`, and every orchestrated deployment finishes with infrastructure settings reconciliation that reasserts and verifies it without replacing Wrangler's application version; failure blocks deployment and enforcement.
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
