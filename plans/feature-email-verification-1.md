---
goal: Implement email verification for Better Auth accounts through Cloudflare Email Service
date_created: 2026-09-19
last_updated: 2026-09-19
status: 'Planned'
tags: [feature, authentication, email, cloudflare, terraform, security]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Implement mandatory email verification for new email/password accounts while keeping Better Auth and Postgres authoritative for identity, credentials, verification state, and sessions. Cloudflare Email Service will deliver Better Auth-generated verification links through the native `EMAIL` Worker binding; the work is released in two increments so infrastructure readiness is proven before verification enforcement changes signup behavior.

This plan completes the email-verification feature described in `plans/email-verification.md`. The 30-day deletion automation is explicitly excluded from this deployment because the repository has no auth-account cleanup scheduler; this plan must document that operational gap and create a separately reviewed follow-up before the feature is considered operationally complete.

## 1. Requirements & Constraints

- **REQ-001**: Better Auth `1.5.6` and Postgres remain the only authoritative stores for users, password credentials, `user.emailVerified`, verification semantics, and sessions.
- **REQ-002**: New email/password signup creates an unverified user and returns `token: null`; it must not create a usable session or navigate the frontend to `/dashboard`.
- **REQ-003**: Correct-password sign-in for an unverified account sends a fresh verification message and preserves Better Auth's structured `EMAIL_NOT_VERIFIED` error.
- **REQ-004**: Verification tokens expire after `3600` seconds, successful verification does not sign the user in, and the user is redirected to the absolute frontend `/login?verified=true` callback.
- **REQ-005**: Invalid and expired verification links redirect to the login callback with Better Auth's `INVALID_TOKEN` and `TOKEN_EXPIRED` codes; frontend rendering accepts only those two values and gives error state precedence over `verified=true`.
- **REQ-006**: Signup success and Better Auth's enumeration-safe synthetic duplicate response both navigate to `/verify-email` and display identical generic copy without an email address.
- **REQ-007**: No public resend endpoint is added. Correct-password sign-in is the initial resend mechanism.
- **REQ-008**: Cloudflare Email Service sends the message exclusively through a native Worker `send_email` binding named `EMAIL`; no REST client, SMTP client, provider API token, Resend package, or notification queue path is introduced.
- **REQ-009**: Verification email delivery uses the current request's Hono execution context and passes one observed delivery promise to `executionCtx.waitUntil()` exactly once.
- **REQ-010**: Missing `HYPERDRIVE`, `BETTER_AUTH_SECRET`, `EMAIL`, or non-empty `AUTH_EMAIL_FROM` returns `503` on `/api/auth/*` before Better Auth can create an account.
- **REQ-011**: A provider rejection after account creation does not roll back or mark the user verified; the account remains unusable and recoverable through correct-password sign-in.
- **REQ-012**: The email contains plain-text and HTML bodies, uses `Mako` as the sender name, uses the configured sender address, and HTML-escapes the full verification URL, including `&` to `&amp;`.
- **REQ-013**: Better Auth rate limiting is explicitly enabled with database storage and client IP resolution from `cf-connecting-ip`.
- **REQ-014**: Staging and production independently define public GitHub environment variables `EMAIL_SENDING_ZONE_ID` and `EMAIL_SENDING_DOMAIN`; `AUTH_EMAIL_FROM` is derived as `noreply@${EMAIL_SENDING_DOMAIN}` and is not stored as a secret.
- **REQ-015**: Terraform provisions one environment-specific `cloudflare_email_sending_subdomain.auth` and exposes readiness outputs; Email Service-managed MX, SPF, DKIM, DMARC, and return-path records are not duplicated as `cloudflare_dns_record` resources.
- **REQ-016**: `backend-rest` is the only application receiving `EMAIL` and `AUTH_EMAIL_FROM`; no email binding is added to frontend, greedy-matcher, or notification-orchestrator.
- **REQ-017**: Local `wrangler dev` keeps the binding local, never commits `remote: true`, and uses `noreply@example.invalid` as the safe sender default.
- **REQ-018**: Infrastructure readiness, DNS validity, binding parity, redaction, and a controlled staging send must pass before verification enforcement is promoted.
- **REQ-019**: A 30-day retention policy for never-verified password accounts is documented; automation is a separate follow-up unless a reviewed auth-account cleanup scheduler is introduced.
- **REQ-020**: Cloudflare `EmailSendResult.messageId` represents acceptance/queueing only and must never be documented or emitted as proof of mailbox delivery.
- **SEC-001**: Application logs must never contain recipient addresses, verification URLs, JWT tokens, callback query strings, message bodies, or raw provider error messages.
- **SEC-002**: Better Auth logging is configured as `logger: { disabled: true }` because Better Auth `1.5.6` logs an existing signup email address at info level.
- **SEC-003**: Email adapter telemetry uses fixed event names and an allowlist of Cloudflare Email Service error codes; unknown errors map to `UNKNOWN` without logging `error.message`, the thrown object, or payload fields.
- **SEC-004**: Terraform sets `preview_enabled = false` and `drop_suppressed_recipients = false`; readiness checks verify both values after provisioning because new domains enable previews by default.
- **SEC-005**: Terraform sets `cloudflare_workers_script.backend_api.observability.redact_query_string = true` so invocation telemetry cannot retain verification JWT query parameters.
- **SEC-006**: The Cloudflare deployment token, not `CLOUDFLARE_RUNTIME_API_TOKEN`, receives the Email Sending edit permission required to provision the sending domain.
- **SEC-007**: `BETTER_AUTH_TRUSTED_ORIGINS` includes the frontend origin used by the absolute verification callback; origin checks are not disabled.
- **SEC-008**: Local simulated email files contain verification links and are treated as sensitive ephemeral artifacts; they remain ignored and are removed after smoke testing.
- **CON-001**: Persistent Cloudflare resources and deployed binding values remain Terraform-owned; committed Wrangler bindings mirror the application-facing binding names and local defaults.
- **CON-002**: Cloudflare provider `~> 5.25` supports `cloudflare_email_sending_subdomain`, `send_email.allowed_sender_addresses`, and Terraform's `observability.redact_query_string`.
- **CON-003**: Resolved Wrangler `4.73.0` supports `send_email.allowed_sender_addresses` but its published JSON schema does not expose `observability.redact_query_string`; no unsupported Wrangler key may be committed.
- **CON-004**: Because Wrangler cannot currently express query-string redaction, Terraform is authoritative for that one observability field. Deployment A must prove that a subsequent Wrangler deployment preserves it; if it does not, Deployment B is blocked until Wrangler supports the field or the deployment pipeline gains an explicit supported post-deploy settings step.
- **CON-005**: `apps/backend-rest/src/index.ts` currently declares `WorkerBindings` manually while `apps/backend-rest/package.json` already exposes `cf-typegen`; generated binding types must become the primary Cloudflare binding contract without losing the test-only `DB` binding.
- **CON-006**: File routes are generated by TanStack Start. Add route source files and regenerate `apps/frontend/src/routeTree.gen.ts`; never hand-edit the generated route tree.
- **CON-007**: The existing direct-SQL migration runner remains the only schema migration mechanism; no additional data-access abstraction is introduced.
- **CON-008**: Verification links in Better Auth `1.5.6` are signed stateless JWTs and are neither revocable nor strictly single-use; the generic `verification` table does not change this behavior.
- **GUD-001**: Preserve the existing frontend smart/dumb split: route files validate URL state, smart components own mutations/navigation, and dumb components render only typed props.
- **GUD-002**: Tests assert consumer-visible behavior, privacy boundaries, and request-context isolation rather than source strings or forwarding implementation.
- **PAT-001**: Keep cached Better Auth instances only for static, callback-free session lookup; any instance containing a request-scoped `sendVerificationEmail` callback bypasses `authCache` and is never retained globally.
- **PAT-002**: Keep the verification adapter provider-specific in `apps/backend-rest`; expose only a provider-independent `SendVerificationEmail` callback from `@mako/shared-backend`.

## 2. Implementation Steps

### Implementation Phase 1: Freeze environment and rollout contract

- **GOAL-001**: Establish separate staging and production sending identities and make the readiness gate explicit before any authentication behavior changes.

- [ ] **TASK-001**: Configure Cloudflare and GitHub environment prerequisites.
  - In each GitHub environment, add non-secret variables `EMAIL_SENDING_ZONE_ID` and `EMAIL_SENDING_DOMAIN` with values owned by that environment's Cloudflare account.
  - Confirm the selected zone contains the sending domain, Cloudflare DNS is authoritative, and the Terraform token has Email Sending edit access in addition to existing permissions.
  - Confirm each account's plan permits delivery to arbitrary recipients; use controlled verified destinations until that prerequisite is satisfied.
  - Do not modify either `scripts/set-github-env-secrets*.sh` file.
  - Completion: both environment variable pairs are non-empty, account-local, and recorded in `docs/system/system-design/ci-cd.md` without secret values.

- [ ] **TASK-002**: Encode the two-deployment promotion rule in operator documentation.
  - Update `docs/infrastructure/management.md` and `docs/system/system-design/ci-cd.md` to define Deployment A as domain/binding/redaction readiness and Deployment B as verification enforcement.
  - State that independent workflow triggers do not establish ordering and that Deployment B is blocked until `TASK-025` passes.
  - Completion: the runbook names the approver-visible readiness evidence and rollback boundary for each deployment.

### Implementation Phase 2: Provision Email Service with Terraform

- **GOAL-002**: Provision the environment-specific sending domain and restricted backend bindings without exposing message content.

- [ ] **TASK-003**: Add validated Terraform inputs and the derived sender.
  - In `infrastructure/variables.tf`, add required string variables `email_sending_zone_id` and `email_sending_domain`.
  - Validate `trimspace(var.email_sending_zone_id) != ""`. Validate the domain with `var.email_sending_domain == lower(trimspace(var.email_sending_domain))`, `length(var.email_sending_domain) <= 253`, and `can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$", var.email_sending_domain))`; this rejects schemes, paths, ports, whitespace, wildcards, and `@`.
  - In `infrastructure/main.tf` locals, add `auth_email_from = "noreply@${var.email_sending_domain}"`.
  - In `infrastructure/terraform.tfvars.example`, add non-secret example values adjacent to Cloudflare account configuration.
  - Dependencies: `TASK-001` defines the environment values.
  - Completion: `terraform validate` rejects empty/URL-shaped values and accepts a domain such as `mail.staging-example.com`.

- [ ] **TASK-004**: Provision the Email Sending domain and backend-only bindings.
  - In `infrastructure/main.tf`, add `cloudflare_email_sending_subdomain.auth` with `zone_id`, `name`, `preview_enabled = false`, and `drop_suppressed_recipients = false`.
  - Add a `send_email` entry to `cloudflare_workers_script.backend_api.bindings` with `name = "EMAIL"` and `allowed_sender_addresses = [local.auth_email_from]`.
  - Add a `plain_text` entry named `AUTH_EMAIL_FROM` with `text = local.auth_email_from`.
  - Add `depends_on = [cloudflare_email_sending_subdomain.auth]` to `cloudflare_workers_script.backend_api` because the binding values alone do not reference the resource.
  - Set `redact_query_string = true` in the backend Worker's Terraform observability object; do not change the other Workers.
  - Do not create DNS record resources and do not add message content to a queue.
  - Dependencies: `TASK-003`.
  - Completion: the provider schema accepts all attributes, the Terraform plan contains exactly one sending domain and one backend `send_email` binding, and no other Worker gains email bindings.

- [ ] **TASK-005**: Add non-sensitive readiness outputs and infrastructure documentation.
  - In `infrastructure/outputs.tf`, add `email_sending_domain`, `auth_email_from`, `email_sending_enabled`, `email_sending_dkim_selector`, and `email_sending_return_path_domain` from `cloudflare_email_sending_subdomain.auth`.
  - Describe `email_sending_enabled` as domain readiness, not delivery proof.
  - Update `infrastructure/README.md`, `docs/infrastructure/management.md`, and `docs/infrastructure/backend.md` with Terraform ownership, Cloudflare-managed DNS, the backend-only bindings, preview/suppression settings, and the separate-account constraint.
  - Dependencies: `TASK-004`.
  - Completion: outputs contain no recipient, verification URL, token, or message body.

- [ ] **TASK-006**: Wire Terraform environment variables and readiness output into infrastructure CI.
  - In both jobs in `.github/workflows/deploy-infrastructure.yml`, export `${{ vars.EMAIL_SENDING_ZONE_ID }}` as `TF_VAR_email_sending_zone_id` and `${{ vars.EMAIL_SENDING_DOMAIN }}` as `TF_VAR_email_sending_domain`.
  - Extend the existing validation step to fail on either empty variable before `terraform init` or `terraform apply`.
  - After apply, read `terraform output -raw email_sending_enabled` and fail unless it is exactly `true`; print only the boolean result and sending domain, never message data.
  - Dependencies: `TASK-005`.
  - Completion: staging and production jobs use their matching GitHub environment and cannot apply with missing email configuration.

### Implementation Phase 3: Mirror application bindings and deployment rendering

- **GOAL-003**: Make local development and Wrangler deployment use the same binding names and sender allowlist as Terraform while preserving Terraform-only redaction.

- [ ] **TASK-007**: Add safe Wrangler defaults and generated binding types.
  - In `apps/backend-rest/wrangler.jsonc`, add `vars.AUTH_EMAIL_FROM = "noreply@example.invalid"` and a `send_email` entry `{ "name": "EMAIL", "allowed_sender_addresses": ["noreply@example.invalid"] }` without `remote: true`.
  - Add all deployed Worker secret names to Wrangler's `secrets.required` so type generation does not depend on local `.dev.vars` files.
  - Change `apps/backend-rest/package.json` `cf-typegen` to generate `apps/backend-rest/worker-configuration.d.ts` with interface name `GeneratedWorkerBindings` and non-literal variable types (`--strict-vars=false`).
  - Regenerate and commit `worker-configuration.d.ts`; in `apps/backend-rest/src/index.ts`, replace the handwritten platform bindings with `GeneratedWorkerBindings` plus the existing optional test-only `DB?: DatabaseBinding` overlay.
  - Keep the existing Wrangler observability block free of unsupported `redact_query_string`; document Terraform ownership of that field in a JSONC comment and in the runbook.
  - Completion: generated types contain `EMAIL: SendEmail` and `AUTH_EMAIL_FROM: string`, TypeScript still supports the test-only DB path, and Wrangler config validation succeeds.

- [ ] **TASK-008**: Render and validate the sender during backend deployment.
  - In staging and production backend jobs in `.github/workflows/deploy-applications.yml`, expose `${{ vars.EMAIL_SENDING_DOMAIN }}`, reject an empty value, and derive `AUTH_EMAIL_FROM=noreply@$EMAIL_SENDING_DOMAIN`.
  - Extend the existing Node-based Wrangler rendering step: require exactly two `noreply@example.invalid` occurrences, replace both, then fail if the placeholder remains or the rendered sender appears other than exactly twice.
  - Run backend `cf-typegen` and typecheck against the safe committed config before rendering; run `wrangler deploy --keep-vars` only after successful rendering.
  - Do not upload `AUTH_EMAIL_FROM` as a secret and do not grant Email Sending permission to `CLOUDFLARE_RUNTIME_API_TOKEN`.
  - Dependencies: `TASK-007`.
  - Completion: the deployed Wrangler sender value and allowlist are identical to Terraform's `local.auth_email_from`.

- [ ] **TASK-009**: Add a deterministic redaction-preservation gate.
  - After the first staging Wrangler deployment, open the backend Worker in the Cloudflare dashboard, inspect **Settings > Observability**, and record evidence that query-string redaction remains enabled.
  - Do not add an unknown Wrangler property or `unsafe` metadata workaround. Keep this dashboard check as a manual promotion gate until Cloudflare publishes a supported Wrangler/API field, then replace it with an automated boolean assertion.
  - If the setting is disabled after deployment, stop Deployment B. Upgrade to a Wrangler version whose schema exposes redaction or add a separately verified, supported post-deploy settings operation using the deployment token, then repeat the gate.
  - Dependencies: `TASK-004`, `TASK-008`.
  - Completion: a Wrangler deploy cannot silently leave query-string redaction disabled.

### Implementation Phase 4: Add request-scoped email delivery

- **GOAL-004**: Deliver Better Auth-generated links through Cloudflare with safe content and telemetry, bound to the originating request context.

- [ ] **TASK-010**: Implement the focused Cloudflare verification-email adapter.
  - Create `apps/backend-rest/src/auth-verification-email.ts` exporting a factory that accepts `SendEmail`, `from`, a bound `waitUntil(promise)` callback, and a narrow logger.
  - Return a `SendVerificationEmail` function accepting only `{ email, url }`.
  - Build one structured message with `to`, `from: { email: from, name: "Mako" }`, subject `Verify your Mako email`, plain text, and HTML.
  - Escape `&`, `<`, `>`, `"`, and `'` before placing the URL in `href`; do not interpolate a user name.
  - Create one observed send promise that maps success to a fixed `auth.verification_email.accepted` event and catches rejection into `auth.verification_email.rejected` with only `provider`, `outcome`, and an allowlisted `errorCode`.
  - Pass that observed promise to `waitUntil()` once and return without awaiting provider completion; do not register another background task.
  - Completion: the adapter has no database dependency and no logging path can receive recipient, URL, token, body, raw error, or provider message.

- [ ] **TASK-011**: Prove adapter content, privacy, and background semantics.
  - Create `apps/backend-rest/src/auth-verification-email.test.ts` with a fake `SendEmail`, fake `waitUntil`, and captured safe logger.
  - Assert recipient/sender/name/subject, both body formats, URL escaping, and exactly one `waitUntil` registration of the send-derived promise.
  - Reject with each allowlisted provider code and one arbitrary object containing sentinel PII; assert logs contain the mapped code but none of the sentinels or raw message.
  - Assert provider rejection is consumed by the observed promise so it remains observable without becoming an unhandled rejection.
  - Dependencies: `TASK-010`.
  - Completion: tests fail if a future change logs or double-registers sensitive delivery work.

### Implementation Phase 5: Enforce verification in Better Auth and backend-rest

- **GOAL-005**: Enable verification and distributed rate limiting without retaining request-specific callbacks across Worker requests.

- [ ] **TASK-012**: Extend the shared Better Auth factory safely.
  - In `packages/shared-backend/src/auth/auth-config.ts`, export `SendVerificationEmail = (input: { email: string; url: string }) => Promise<void>` and add optional `sendVerificationEmail` to `CreateBetterAuthOptions`.
  - Adapt Better Auth's `{ user, url }` callback to `{ email: user.email, url }`; never expose Cloudflare types from the package.
  - Configure `emailVerification` with `expiresIn: 3600`, `sendOnSignUp: true`, `sendOnSignIn: true`, `autoSignInAfterVerification: false`, and the callback.
  - Set `emailAndPassword.enabled = true` and `requireEmailVerification = true`; set `rateLimit.enabled = true`, `rateLimit.storage = "database"`; add `advanced.ipAddress.ipAddressHeaders = ["cf-connecting-ip"]`; retain UUID and secure-cookie configuration; add `logger: { disabled: true }`.
  - Refactor cache lookup so options containing `sendVerificationEmail` bypass lookup and insertion. Continue caching only normalized static options that contain no callback.
  - Update `packages/shared-backend/src/auth/auth-config.test.ts` to assert exact policy options, disabled logger, cache bypass for distinct callbacks, and continued reuse for callback-free session instances.
  - Completion: two request callbacks can never resolve to the same cached Better Auth object.

- [ ] **TASK-013**: Add Better Auth's database rate-limit table.
  - Create the next timestamped SQL file under `packages/shared-backend/migrations/` using the migration generator.
  - Create `"rateLimit"` with `key TEXT PRIMARY KEY`, `count INTEGER NOT NULL`, and `"lastRequest" BIGINT NOT NULL`, matching Better Auth `1.5.6`'s `BaseRateLimit` fields and default model/field names.
  - Use `CREATE TABLE IF NOT EXISTS` and no user/profile columns.
  - Add `packages/shared-backend/src/auth/rate-limit-schema-readiness.test.ts`; connect to the isolated migrated test database, query `information_schema.columns`, and assert the exact table name, column names, Postgres types, nullability, and primary key instead of reading SQL source text.
  - Completion: two Worker isolates share database-backed counters and no in-memory fallback is configured.

- [ ] **TASK-014**: Split static session auth from request-scoped auth endpoints.
  - In `apps/backend-rest/src/index.ts`, keep callback-free cached Better Auth construction for auth-session middleware on non-auth application routes.
  - Skip auth-session middleware for both `/api/webhooks/*` and `/api/auth/*`; Better Auth owns auth endpoint session handling.
  - For `registerAuthController`, create an uncached Better Auth instance from the current Hono context only after checking `HYPERDRIVE.connectionString`, `BETTER_AUTH_SECRET`, `EMAIL`, and trimmed `AUTH_EMAIL_FROM`.
  - Build the adapter from `context.env.EMAIL`, `context.env.AUTH_EMAIL_FROM`, and a bound closure `promise => context.executionCtx.waitUntil(promise)`; never destructure `waitUntil`.
  - Pass the adapter callback to `createBetterAuth`; keep frontend origin parsing through `BETTER_AUTH_TRUSTED_ORIGINS` and the existing base URL resolver.
  - Emit a fixed missing-configuration event containing only missing binding names, then return `null` so the controller responds `503` before invoking Better Auth.
  - Completion: two concurrent auth requests register sends on their own execution contexts and session middleware does not construct a second request-bound auth instance.

- [ ] **TASK-015**: Update auth boundary failures and backend tests.
  - In `packages/shared-backend/src/auth/auth-controller.ts`, replace the stale 503 text with a generic runtime-configuration error that does not enumerate secret values.
  - Extend `packages/shared-backend/src/auth/auth-controller.test.ts` and `apps/backend-rest/src/index.test.ts` for missing `EMAIL`, missing/blank `AUTH_EMAIL_FROM`, no Better Auth handler invocation before 503, auth middleware bypass, provider rejection after account creation, and concurrent context isolation.
  - Assert logs contain fixed event/code metadata but no recipient, URL, token, body, or raw provider message sentinels.
  - Dependencies: `TASK-011`, `TASK-012`, `TASK-014`.
  - Completion: runtime configuration fails closed before signup, while asynchronous delivery rejection leaves the returned account unverified.

### Implementation Phase 6: Change the frontend account flow

- **GOAL-006**: Replace immediate post-signup authentication with an enumeration-safe verification flow and typed login outcomes.

- [ ] **TASK-016**: Preserve Better Auth error structure.
  - In `apps/frontend/src/routes/auth/shared/auth-flow.ts`, add an `AuthFlowError` class carrying optional `code` and numeric `status` while preserving a non-empty safe message.
  - Change `throwIfAuthResultHasError()` to extract only `code`, `message`, and `status` from object-like Better Auth errors and throw `AuthFlowError`; keep the existing generic fallback for malformed errors.
  - Keep `handleAuthSuccess()` unchanged for actual login and update `auth-flow.test.ts` for structured and malformed inputs.
  - Completion: login logic can branch on `code === "EMAIL_NOT_VERIFIED"` without comparing provider wording.

- [ ] **TASK-017**: Change signup to request verification and show the holding page.
  - In `apps/frontend/src/routes/auth/signup/signup-smart.tsx`, call `authClient.signUp.email()` with existing form values plus `callbackURL: new URL("/login?verified=true", window.location.origin).toString()`.
  - Remove `useQueryClient` and `handleAuthSuccess` from signup; on every successful Better Auth response, including synthetic duplicate signup, navigate directly to `/verify-email`.
  - Do not inspect `token`, user ID, `emailVerified`, or any synthetic-response field and do not invalidate `authSessionQueryKey`.
  - Keep validation and API error rendering unchanged.
  - Completion: signup never navigates to `/dashboard` and never places the submitted email in stateful navigation or URL search.

- [ ] **TASK-018**: Add the enumeration-safe verification page.
  - Create `apps/frontend/src/routes/verify-email.tsx` and `apps/frontend/src/routes/auth/verify-email/verify-email-dumb.tsx`.
  - The route renders the dumb component directly because the page has no business logic or server state.
  - Render exactly the approved generic meaning: eligibility is conditional, delivery may take a few minutes, and an existing account can sign in with the correct password to request a fresh link.
  - Link to `/login`; do not read search params, submitted state, or synthetic response data.
  - Regenerate `apps/frontend/src/routeTree.gen.ts` through TanStack Start/Vite tooling.
  - Completion: `/verify-email` renders without exposing whether an account or email exists.

- [ ] **TASK-019**: Add typed login callback state and unverified guidance.
  - In `apps/frontend/src/routes/login.tsx`, add `validateSearch` that accepts only `verified === "true"`/`true` and `error` equal to `TOKEN_EXPIRED` or `INVALID_TOKEN`; discard all other values.
  - Pass the validated search object into `LoginSmart` as typed props rather than reading `window.location.search` in the component.
  - In `login-smart.tsx`, map `AuthFlowError.code === "EMAIL_NOT_VERIFIED"` to fixed generic verification guidance; all other sign-in failures retain current generic behavior.
  - In `login-dumb.tsx`, render typed banners: invalid/expired error first, then verified success, then form error. Never render the raw query value or Better Auth's unverified provider message.
  - Keep successful verified login behavior using `handleAuthSuccess()` and `/dashboard`.
  - Completion: a URL containing both `verified=true` and a supported error displays only error guidance.

- [ ] **TASK-020**: Update frontend behavior tests and generated routing.
  - Extend signup tests to assert the absolute callback URL, `/verify-email` navigation for normal and synthetic success, and absence of session invalidation/dashboard navigation.
  - Extend login tests for structured `EMAIL_NOT_VERIFIED`, verified success, both supported link errors, precedence, arbitrary query suppression, and normal verified login.
  - Extend `auth-forms.test.tsx` for enumeration-safe verification copy and accessible status/alert semantics.
  - Add a route-level test for `validateSearch` allowlisting and regenerate `routeTree.gen.ts` without manual edits.
  - Dependencies: `TASK-016` through `TASK-019`.
  - Completion: frontend tests defend user-visible state and enumeration safety, not implementation wiring.

### Implementation Phase 7: Complete documentation, retention, and operations

- **GOAL-007**: Make the API contract, privacy boundary, retention gap, and operational response explicit.

- [ ] **TASK-021**: Correct authentication API documentation.
  - In `docs/system/system-design/api-routes.md`, replace stale `/sign-up` and `/sign-in` entries with `/api/auth/sign-up/email` and `/api/auth/sign-in/email`.
  - Document signup `{ user, token: null }`, synthetic duplicate behavior, `GET /api/auth/verify-email`, callback redirects, `EMAIL_NOT_VERIFIED`, asynchronous delivery, and non-rollback on provider rejection.
  - Document that verification tokens are signed one-hour JWTs and are not database-revocable or strictly single-use.
  - Completion: documented request/response and redirect states match Better Auth `1.5.6` source behavior.

- [ ] **TASK-022**: Document retention and operational monitoring.
  - In `docs/infrastructure/backend.md`, document the 30-day policy for never-verified users that have a password credential and the requirement to exclude social-only users.
  - Record the current automation gap and create a separately reviewed follow-up for transactional, idempotent deletion of the user and dependent credentials; do not add cleanup to notification-orchestrator in this change.
  - Document fixed events/alerts for provider rejection, Better Auth rate limiting, daily limit, suppressed recipient, invalid sender/domain, missing runtime binding, and background-promise rejection.
  - State that Email Service necessarily retains recipient delivery metadata and that local simulator output is sensitive ephemeral data.
  - Completion: operators have an owner and response path for every named condition without application PII in telemetry.

### Implementation Phase 8: Verify and promote in two deployments

- **GOAL-008**: Prove the full contract locally and in staging before production enforcement.

- [ ] **TASK-023**: Add Better Auth behavioral integration coverage.
  - Add `packages/shared-backend/src/auth/auth-config.integration.test.ts` using an isolated migrated Postgres test database and real Better Auth requests.
  - Cover new signup returning no token/session, unverified sign-in rejection plus replacement-send callback, successful verification changing `emailVerified`, no auto-session after verification, explicit one-hour expiry, and synthetic duplicate response.
  - Isolate users and cleanup rows so the test is deterministic and full-suite safe; do not assert token internals beyond expiry behavior.
  - Dependencies: `TASK-012`, `TASK-013`.
  - Completion: tests fail if verification enforcement, resend behavior, or no-auto-sign-in semantics regress.

- [ ] **TASK-024**: Run scoped automated verification and local smoke flow.
  - Run Terraform formatting/validation, backend-rest type generation/typecheck/tests, shared-backend auth tests with the local Postgres test stack, and frontend typecheck/auth tests.
  - Start normal `wrangler dev` without `remote: true`, register a unique local account, verify there is no authenticated session, inspect the simulated email file, open its link, verify `emailVerified`, verify no session was created, then sign in normally.
  - Use a controlled non-personal local address, confirm no real delivery, and delete simulator artifacts after recording pass/fail evidence.
  - Dependencies: all implementation tasks.
  - Completion: the exact local flow described above passes and logs contain none of the sentinel recipient/token/body values outside Wrangler's expected ephemeral simulator artifact.

- [ ] **TASK-025**: Complete Deployment A infrastructure readiness.
  - For staging, run `terraform validate`, inspect `terraform plan`, apply, and verify `email_sending_enabled=true`, `preview_enabled=false`, `drop_suppressed_recipients=false`, Cloudflare-managed SPF/DKIM/DMARC/return-path validity, backend `EMAIL`/`AUTH_EMAIL_FROM`, exact sender allowlist, and query-string redaction.
  - Deploy backend code with verification enforcement still disabled or held behind the deployment boundary, perform one controlled staging send, and execute `TASK-009`'s redaction-preservation check.
  - Repeat infrastructure readiness for production without enabling verification behavior.
  - Completion: domain readiness, controlled staging acceptance, Terraform/Wrangler binding parity, and redaction evidence are recorded; acceptance is not described as delivery proof.

- [ ] **TASK-026**: Complete Deployment B staging E2E and production canary.
  - Coordinate backend and frontend promotion so the old frontend never receives enforced unverified signup responses.
  - In staging, test unique signup, no dashboard session, mailbox receipt, success redirect, post-verification login, expired and invalid links, correct-password resend, synthetic duplicate signup, provider rejection/suppression, concurrent request isolation, rate limiting, and log redaction.
  - Inspect application, Worker, and Email Service preview settings for absence of recipient address, verification URL, token, and message body; provider-controlled delivery metadata is expected.
  - Promote to production only after staging passes, then run one controlled-inbox canary and verify login after verification.
  - Dependencies: `TASK-024`, `TASK-025`.
  - Completion: all definition-of-done behavior is observed in staging and the production canary passes without rollback.

## 3. Alternatives

- **ALT-001**: Use the Cloudflare Email Service REST API from the Worker. Rejected because the native binding removes token distribution, network overhead, and an unnecessary runtime secret.
- **ALT-002**: Route verification messages through the shared notification queue. Rejected because it would spread verification JWTs and recipient PII across another Worker and queue retention boundary and would break request-context `waitUntil()` ownership.
- **ALT-003**: Retain the current global Better Auth cache for request-bound callbacks. Rejected because `JSON.stringify()` omits functions, allowing the first request's execution context to be reused by another request.
- **ALT-004**: Remove Better Auth caching entirely. Rejected for session-only requests because Better Auth initialization and schema validation would repeat unnecessarily; callback-free session instances can remain safely cached.
- **ALT-005**: Add a public resend endpoint immediately. Rejected because correct-password sign-in already triggers Better Auth's enumeration-resistant resend path and avoids another abuse surface.
- **ALT-006**: Auto-sign in after link verification. Rejected by product policy; explicit post-verification sign-in makes the session transition clear and keeps link clicks from creating sessions.
- **ALT-007**: Store rate limits in Worker memory. Rejected because isolate-local state does not enforce distributed limits.
- **ALT-008**: Add `redact_query_string` directly to Wrangler JSONC despite schema rejection. Rejected because unsupported config is not deployable; Terraform owns the field until Wrangler exposes it.
- **ALT-009**: Add account-retention cleanup to the notification orchestrator now. Rejected because no reviewed auth-account cleanup pattern exists and deletion crosses credential/session foreign keys; ship it as a dedicated follow-up.

## 4. Dependencies

- **DEP-001**: Better Auth remains pinned to `1.5.6`; implementation and tests use that version's callback signatures, `EMAIL_NOT_VERIFIED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, synthetic duplicate response, and `rateLimit` schema.
- **DEP-002**: Cloudflare provider remains compatible with `~> 5.25` and the provider token can manage Email Sending for each selected zone.
- **DEP-003**: Resolved Wrangler `4.73.0` supports structured `SendEmail` and sender restrictions; generated binding types are produced from the committed config.
- **DEP-004**: Each environment's Cloudflare account owns a containing zone or genuinely delegated subdomain zone and Cloudflare DNS is authoritative.
- **DEP-005**: The frontend origin is present in the environment-specific `BETTER_AUTH_TRUSTED_ORIGINS` value before callback URLs are accepted.
- **DEP-006**: The local Postgres test stack and migration runner are available for rate-limit schema and Better Auth integration coverage.
- **DEP-007**: TanStack Start/Vite route generation updates `apps/frontend/src/routeTree.gen.ts` after adding `/verify-email`.
- **DEP-008**: A controlled staging inbox and a reproducible provider rejection or suppression case are available for Deployment A/B acceptance.
- **DEP-009**: Query-string redaction survives Wrangler deployment or a supported remediation is available; otherwise verification enforcement remains blocked.

## 5. Files

- **FILE-001**: `infrastructure/variables.tf` — add validated email zone and domain inputs.
- **FILE-002**: `infrastructure/main.tf` — add sender local, Email Sending domain, backend bindings, dependency, and query redaction.
- **FILE-003**: `infrastructure/outputs.tf` — add domain, sender, enabled, DKIM, and return-path outputs.
- **FILE-004**: `infrastructure/terraform.tfvars.example` — add non-secret example configuration.
- **FILE-005**: `infrastructure/README.md` — document provisioning and readiness.
- **FILE-006**: `docs/infrastructure/management.md` — document ownership, deployment split, and redaction exception.
- **FILE-007**: `docs/infrastructure/backend.md` — document bindings, privacy, retention gap, and operations.
- **FILE-008**: `.github/workflows/deploy-infrastructure.yml` — inject Terraform variables and enforce enabled output.
- **FILE-009**: `.github/workflows/deploy-applications.yml` — validate/render sender, typecheck, and deploy matching Wrangler bindings.
- **FILE-010**: `docs/system/system-design/ci-cd.md` — document environment variables, permissions, rendering, and readiness gates.
- **FILE-011**: `apps/backend-rest/wrangler.jsonc` — add safe sender var, email binding, secret declarations, and ownership comment.
- **FILE-012**: `apps/backend-rest/package.json` — make `cf-typegen` deterministic and non-literal for vars.
- **FILE-013**: `apps/backend-rest/worker-configuration.d.ts` — generated `GeneratedWorkerBindings` contract.
- **FILE-014**: `apps/backend-rest/src/auth-verification-email.ts` — Cloudflare adapter and safe telemetry.
- **FILE-015**: `apps/backend-rest/src/auth-verification-email.test.ts` — adapter behavior/privacy tests.
- **FILE-016**: `apps/backend-rest/src/index.ts` — generated binding overlay, runtime guards, middleware scope, request callback wiring.
- **FILE-017**: `apps/backend-rest/src/index.test.ts` — runtime configuration, provider rejection, and context isolation tests.
- **FILE-018**: `packages/shared-backend/src/auth/auth-config.ts` — verification policy, callback type, cache safety, rate limiting, logger.
- **FILE-019**: `packages/shared-backend/src/auth/auth-config.test.ts` — factory policy and cache tests.
- **FILE-020**: `packages/shared-backend/src/auth/auth-config.integration.test.ts` — real Better Auth verification behavior.
- **FILE-021**: `packages/shared-backend/src/auth/auth-controller.ts` — generic fail-closed 503 response.
- **FILE-022**: `packages/shared-backend/src/auth/auth-controller.test.ts` — boundary behavior and safe logging.
- **FILE-023**: `packages/shared-backend/migrations/<timestamp>_add_better_auth_rate_limit.sql` — database-backed rate-limit table.
- **FILE-024**: `packages/shared-backend/src/auth/rate-limit-schema-readiness.test.ts` — migrated schema readiness.
- **FILE-025**: `apps/frontend/src/routes/auth/shared/auth-flow.ts` — typed `AuthFlowError`.
- **FILE-026**: `apps/frontend/src/routes/auth/shared/auth-flow.test.ts` — structured error tests.
- **FILE-027**: `apps/frontend/src/routes/auth/signup/signup-smart.tsx` — callback URL and verification-page navigation.
- **FILE-028**: `apps/frontend/src/routes/auth/signup/signup-smart.test.tsx` — signup flow tests.
- **FILE-029**: `apps/frontend/src/routes/verify-email.tsx` — new file route.
- **FILE-030**: `apps/frontend/src/routes/auth/verify-email/verify-email-dumb.tsx` — enumeration-safe page.
- **FILE-031**: `apps/frontend/src/routes/login.tsx` — typed search validation.
- **FILE-032**: `apps/frontend/src/routes/auth/login/login-smart.tsx` — structured unverified handling.
- **FILE-033**: `apps/frontend/src/routes/auth/login/login-dumb.tsx` — typed verification banners.
- **FILE-034**: `apps/frontend/src/routes/auth/login/login-smart.test.tsx` — login and callback-state tests.
- **FILE-035**: `apps/frontend/src/routes/auth/auth-forms.test.tsx` — verification-page and banner rendering tests.
- **FILE-036**: `apps/frontend/src/routeTree.gen.ts` — generated route registration.
- **FILE-037**: `docs/system/system-design/api-routes.md` — accurate Better Auth route and failure contracts.
- **FILE-038**: `.env.example` — clarify that trusted origins include the frontend callback origin; no new email secrets.

## 6. Testing

- **TEST-001**: Terraform validation rejects empty or malformed email domains and plans exactly one Email Sending domain plus backend-only bindings.
- **TEST-002**: Wrangler schema/type generation accepts `EMAIL`, `AUTH_EMAIL_FROM`, and `allowed_sender_addresses`; generated types compile without handwritten platform binding drift.
- **TEST-003**: Email adapter sends correct structured content, escapes URL attributes, and registers one observed promise with the originating execution context.
- **TEST-004**: Email adapter failures emit only fixed metadata and allowlisted codes; sentinel recipient, URL, JWT, body, and raw provider message never appear.
- **TEST-005**: Better Auth signup creates an unverified user with no session token; synthetic duplicate signup remains indistinguishable at the frontend.
- **TEST-006**: Correct-password unverified sign-in invokes a fresh send callback and returns `EMAIL_NOT_VERIFIED`; wrong credentials do not disclose account existence.
- **TEST-007**: Valid verification changes `emailVerified`, creates no session, redirects to login, and permits a subsequent normal sign-in.
- **TEST-008**: One-hour token expiry yields `TOKEN_EXPIRED`; malformed tokens yield `INVALID_TOKEN`; neither renders the success banner.
- **TEST-009**: Database-backed rate limiting uses the migrated `rateLimit` table and trusted `cf-connecting-ip` header.
- **TEST-010**: Missing `EMAIL` or blank/missing `AUTH_EMAIL_FROM` returns 503 before the Better Auth handler or account-creation SQL executes.
- **TEST-011**: Two concurrent auth requests register delivery on their own `waitUntil` spies with no cache cross-wiring.
- **TEST-012**: Signup navigates only to `/verify-email`, sends an absolute frontend callback URL, and performs no session invalidation.
- **TEST-013**: Login preserves normal success navigation, shows generic unverified guidance, validates supported query values, applies error precedence, and never renders arbitrary query text.
- **TEST-014**: Local Wrangler simulation writes an inspectable message without real delivery; opening its link verifies the user without creating a session.
- **TEST-015**: Staging E2E proves provider acceptance, mailbox receipt, resend recovery, suppression/rejection observability, concurrent isolation, and PII-free application logs.
- **TEST-016**: Post-Wrangler-deploy inspection proves `redact_query_string` remains enabled before verification enforcement.

## 7. Risks & Assumptions

- **RISK-001**: Wrangler `4.73.0` cannot represent query-string redaction although Terraform can. A deploy may reset the setting; `TASK-009` and `TEST-016` are hard rollout gates.
- **RISK-002**: Email Service DNS propagation and domain enablement are eventually consistent. Terraform apply success is not sufficient readiness evidence.
- **RISK-003**: `waitUntil()` preserves work after the response but does not make account creation and email acceptance atomic; users recover through correct-password sign-in.
- **RISK-004**: Stateless Better Auth verification JWTs can be replayed until expiry if the account remains unverified and cannot be individually revoked.
- **RISK-005**: Cloudflare local simulation logs envelope information and stores bodies to local files. Developers must use controlled addresses and delete artifacts.
- **RISK-006**: New Email Sending domains default message preview on; a missed Terraform setting would retain message bodies for about seven days.
- **RISK-007**: Database-backed rate limiting adds write load to Postgres and requires the migration to precede verification enforcement.
- **RISK-008**: Deploying backend enforcement before the new frontend would make the old signup flow treat an unverified response as authenticated.
- **RISK-009**: Deleting unverified users without filtering password credentials could remove social-provider accounts. Cleanup remains a separate reviewed change.
- **RISK-010**: A sender-domain/account mismatch will fail domain provisioning or delivery even when values are syntactically valid.
- **ASSUMPTION-001**: The pinned Better Auth version remains `1.5.6` for implementation; an upgrade requires re-verifying endpoint codes, token behavior, callback signatures, and schema.
- **ASSUMPTION-002**: The Cloudflare provider remains at `~> 5.25`; provider upgrades require a fresh schema review of Email Sending and Workers bindings.
- **ASSUMPTION-003**: `BETTER_AUTH_TRUSTED_ORIGINS` already includes each environment's frontend origin, as current CI documentation prescribes; rollout explicitly verifies it.
- **ASSUMPTION-004**: The repository's local Postgres test stack can execute the new migration and isolate integration-test data.
- **ASSUMPTION-005**: Cloudflare Email Service operational records may retain recipient delivery metadata; the no-PII application logging contract does not apply to provider-controlled delivery, bounce, and suppression systems.

## 8. Related Specifications / Further Reading

- [Source feature specification](../plans/email-verification.md)
- [Cloudflare Email Service Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- [Cloudflare Email Sending domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)
- [Cloudflare send binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
- [Cloudflare local email simulation](https://developers.cloudflare.com/email-service/local-development/sending/)
- [Cloudflare Email Service logs and previews](https://developers.cloudflare.com/email-service/observability/logs/)
- [Cloudflare Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Better Auth email verification](https://better-auth.com/docs/concepts/email)
- [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit)
- [Better Auth `1.5.6` email verification source](https://github.com/better-auth/better-auth/blob/v1.5.6/packages/better-auth/src/api/routes/email-verification.ts)
- [Cloudflare Terraform provider `email_sending_subdomain` resource](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.25.0/docs/resources/email_sending_subdomain.md)
- [Cloudflare Terraform provider `workers_script` resource](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.25.0/docs/resources/workers_script.md)
