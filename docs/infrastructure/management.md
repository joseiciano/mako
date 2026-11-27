# Infrastructure Management

**Last reconciled**: 2026-09-25 (Wrangler migration — Terraform removed)

Infrastructure is managed with committed declarative configs plus a one-time idempotent bootstrap runbook; there is no Terraform, no state backend, and no plan/apply step.

## One-Time Provisioning (`scripts/bootstrap.sh`)

Resource creation happens once per environment by running `scripts/bootstrap.sh <staging|production>` with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEON_API_KEY`, `NEON_ORG_ID`, `EMAIL_SENDING_ZONE_ID`, and `EMAIL_SENDING_DOMAIN`. The script is idempotent: existing resources are detected, mutable policies are converged, and Email Sending readiness is re-verified on every run.

### Managed Resources
- **Neon**: project `mako-<environment>` (pg 17, 6h history retention, aws-us-east-1), role `mako_app`, database `mako`. A freshly created role's password is reset once and the direct `DATABASE_URL` is printed for GitHub secrets; existing environments never touch the role password.
- **Cloudflare Hyperdrive**: `mako-<environment>-hyperdrive` (direct Neon origin — same URI as `DATABASE_URL`; Hyperdrive provides connection pooling with query caching disabled and an origin connection limit of 20). The shared binding serves authentication, sessions, permissions, billing, and read-after-write application flows, so cached SQL responses are prohibited; a stale pre-signup user miss can otherwise make the subsequent verification request return `USER_NOT_FOUND`. The printed ID goes into the `HYPERDRIVE_ID` GitHub secret.
- **Cloudflare Queues**: `notification-orchestration` and `notification-orchestration-dlq` (created before the first orchestrator deploy so the consumer binding resolves). The queue is for async post-commit worker hand-off (notification/orchestration events, not join-time session provisioning).
- **Cloudflare R2**: `mako-recordings` and `mako-screenshots` (location hint `enam`) with the 30-day retention lifecycle rule (delete objects at 2,592,000s, abort multipart uploads at 86,400s), re-asserted on every run.
- **Cloudflare Email Service**: the environment's sending subdomain via the zone-scoped REST API with `preview_enabled=false` and `drop_suppressed_recipients=false`, followed by a 12-attempt readiness poll. Cloudflare manages the domain-authentication and return-path DNS records; nothing in the repo duplicates them.

Everything else is owned by committed Wrangler configs: Workers (`mako-backend-rest`, `mako-notification-orchestrator`, `mako-greedy-matcher`, `mako-frontend`), cron triggers, the queue consumer, and Workflow resources are all created by plain `wrangler deploy` runs in CI. The backend's Worker-level `redact_query_string` is the one setting Wrangler 4.73.0 cannot express, so `scripts/ensure-redact-query-string.sh` reasserts it after every backend deploy.

---

## Wrangler (Deploys and Developer Experience)

**Wrangler** deploys all applications and serves local development.

### Usage
- **Deploys**: `wrangler deploy` from each app directory (CI does this; the `__HYPERDRIVE_ID__` placeholder is injected from the `HYPERDRIVE_ID` secret at deploy time).
- **Local Emulation**: Using `wrangler dev` to simulate the Cloudflare environment (Workers, R2, KV) locally.
- **Tail Logs**: Using `wrangler tail` for real-time debugging of deployed workers.

---

## Deployment Strategy

1. **Resource changes**: edit `scripts/bootstrap.sh` and re-run it against the affected environment; it converges the pinned resources.
2. **Application changes**: deployed via GitHub Actions using the official Cloudflare Wrangler action. This ensures that our Hono-based routes and business logic are updated safely.

> **Operational Note**: Queues and other persistent resources are created by `scripts/bootstrap.sh`, never by ad-hoc `wrangler create` commands in application deploy workflows. If a resource is missing, run the bootstrap instead of creating it inline.

## Email Verification Readiness

The backend always requires email verification, so new users cannot finish sign-up until the environment's Email Service domain delivers mail. Run `scripts/bootstrap.sh` to provision and verify the Email Service domain before the first deploy. For staging and production, evidence must show:

- email sending domain reports `enabled=true` in the bootstrap readiness poll (domain readiness only, never mailbox-delivery proof)
- `preview_enabled=false` and `drop_suppressed_recipients=false`
- valid Cloudflare-managed MX, SPF, DKIM, DMARC, and return-path state
- backend-only `EMAIL` and `AUTH_EMAIL_FROM` bindings with the exact derived sender allowlist
- backend Worker query-string redaction enabled after every Wrangler deployment (`scripts/ensure-redact-query-string.sh`)
- one controlled sign-up whose verification email arrives, with no recipient, verification URL, token, body, or raw provider message in application logs

