# CI/CD & Development Workflow

## GitHub Actions

GitHub Actions provides the quality gate and one ordered deployment path for both required environments. Pushes to `staging` deploy the staging environment; pushes to `main` deploy production. Manual deployments use the same path and must select the environment that matches the branch (`staging`/`staging` or `main`/`production`).

### Workflow Files

- **Quality Gate** (`.github/workflows/quality-gate.yml`)
  - Trigger: every pull request targeting `staging` or `main`.
  - Steps: install dependencies, run linting, type checking, and tests.
- **Deployment Orchestrator** (`.github/workflows/deploy.yml`)
  - This is the only workflow with push and `workflow_dispatch` deployment triggers.
  - It resolves the environment once from the branch, rejects an unsupported branch or a manual branch/environment mismatch, and passes the required `environment` string (`staging` or `production`) to the applications reusable workflow.
  - It checks out the orchestrator run's exact commit SHA; every downstream job deploys one revision.
  - Resource creation is NOT part of this pipeline. One-time provisioning runs via `scripts/bootstrap.sh` per environment (see below); CI only deploys code.
- **Application Deployment** (`.github/workflows/deploy-applications.yml`)
  - Trigger: reusable `workflow_call` only, with required string input `environment`.
  - Ordered jobs: migrate-db → notification-orchestrator → backend-rest → greedy-matcher → frontend. Concurrency groups `deploy-<worker>-${environment}` serialize retries and prevent overlapping deploys per environment.
  - Runs backward-compatible migrations first, then deploys each Worker with plain `wrangler deploy` from the committed `wrangler.jsonc` (the `__HYPERDRIVE_ID__` placeholder is injected from the `HYPERDRIVE_ID` secret at deploy time).
  - Required runtime secrets are synchronized before each Worker deploy: Wrangler's `secrets.required` validation must see the secrets before the first application script deployment.
  - After the backend deploy, `scripts/ensure-redact-query-string.sh` reasserts Worker-level `redact_query_string` via the Workers API (Wrangler 4.73.0 cannot express the setting in wrangler.jsonc) and verifies it.

### Resource Ownership: Bootstrap Script and Wrangler

| Concern | Owner |
|---|---|
| Neon project, role (`mako_app`), and database | `scripts/bootstrap.sh` (one-time, per environment, idempotent) |
| Hyperdrive config (direct Neon origin, caching max-age 60 / swr 15, connection limit 20) | `scripts/bootstrap.sh` |
| Queues `notification-orchestration` / `-dlq` | `scripts/bootstrap.sh` (queues exist before the first orchestrator deploy) |
| R2 buckets `mako-recordings` / `mako-screenshots` (enam) + 30-day lifecycle rules | `scripts/bootstrap.sh` |
| Email Sending subdomain with `preview_enabled=false`, `drop_suppressed_recipients=false`, and readiness poll | `scripts/bootstrap.sh` |
| Workers: `mako-backend-rest`, `mako-notification-orchestrator`, `mako-frontend`, `mako-greedy-matcher` (incl. crons, queue consumer, workflow resources) | Wrangler deploys from committed configs |
| Backend Worker-level `redact_query_string` | `scripts/ensure-redact-query-string.sh` post-deploy step (Wrangler config limitation) |
| Worker runtime secrets | Wrangler synchronization before deployment |

`scripts/bootstrap.sh` is idempotent: run it against an already-provisioned environment and every existing resource is detected and skipped (exit 0). It never handles secret values; it prints resource IDs (Hyperdrive ID) and, for a newly created Neon role only, the `DATABASE_URL` to paste into GitHub secrets. Resetting an existing role's password would invalidate the live `DATABASE_URL`, so the bootstrap skips the password path on already-provisioned environments.

### GitHub Environment Configuration

Both GitHub Environments are required:

- `staging`, restricted to the `staging` branch.

The environments use the same keys with environment-specific values. Staging and production use separate Cloudflare accounts, Neon projects, URLs, and Email Sending domains.

#### Secrets

Provisioning and bootstrap credentials:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for the selected environment |
| `CLOUDFLARE_API_TOKEN` | The single environment-scoped CI token used by the bootstrap script and Wrangler; it must cover Workers, Queues, R2, Hyperdrive, Workflows, and Email Sending (zone) edit permissions and is never exposed to Worker runtime code |
| `NEON_API_KEY` | Required Neon API key used by `scripts/bootstrap.sh` to create the environment's project, role, and database |
| `NEON_ORG_ID` | Neon organization that owns the environment's project |

Application and runtime values:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_RUNTIME_API_TOKEN` | Separate least-privilege token used by deployed Workers at runtime; synchronized to the Worker secret named `CLOUDFLARE_API_TOKEN` and never used by the bootstrap script or CI deploys |

| `DATABASE_URL` | Direct SSL Neon URI used by the migration job; it must target the same database as the environment's Hyperdrive binding |
| `HYPERDRIVE_ID` | Environment's Hyperdrive configuration ID injected into Wrangler configuration |
| `BETTER_AUTH_SECRET` | Better Auth signing secret |
| `BETTER_AUTH_URL` | Environment-specific backend base URL used by Better Auth |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated origins accepted by Better Auth |
| `VITE_AUTH_BASE_URL` | Required backend origin baked into the frontend build; it must identify the selected environment's backend |
| `CLOUDFLARE_REALTIMEKIT_APP_ID` | RealtimeKit application belonging to the selected Cloudflare account |
| `STRIPE_SECRET_KEY` | Environment-specific Stripe secret key; optional in staging until payment testing, required in production |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret; optional in staging until webhook testing, required in production |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key baked into the frontend build |

`CLOUDFLARE_API_TOKEN` is the only CI Cloudflare token name. Do not create separate bootstrap and Wrangler deployment token aliases. `CLOUDFLARE_RUNTIME_API_TOKEN` remains separate because it is application runtime authority, not CI deployment authority.

#### Non-secret Variables

| Variable | Purpose | Accepted value / example |
|---|---|---|
| `EMAIL_SENDING_ZONE_ID` | Cloudflare zone containing the environment's sending domain | 32-character zone ID |
| `EMAIL_SENDING_DOMAIN` | Environment-specific sending domain, created by `scripts/bootstrap.sh` in that zone | `mail.staging.example.com` |
| `AUTH_EMAIL_VERIFICATION_ENFORCED` | Controls both backend Better Auth enforcement and the frontend signup flow for the selected environment | Exact string `true` or `false` |

The committed Wrangler config derives `AUTH_EMAIL_FROM` as `noreply@${EMAIL_SENDING_DOMAIN}` (CI renders it into the committed `noreply@example.invalid` placeholder), exposes it to `backend-rest` as a non-secret plain-text binding, and restricts the `EMAIL` binding's sender allowlist to that address. `AUTH_EMAIL_FROM` is not stored in GitHub.


The committed local Wrangler default for `AUTH_EMAIL_VERIFICATION_ENFORCED` is `false`. The application workflow renders the same validated value into the backend binding and maps it to the frontend build as `VITE_AUTH_EMAIL_VERIFICATION_ENFORCED`; both consumers accept only exact lowercase `true` or `false`. When false, the frontend retains the existing immediate-authentication signup behavior. Deployment A keeps the GitHub Environment variable at `false` while infrastructure, binding parity, controlled delivery, and redaction preservation are proven. Deployment B changes the variable to `true` in staging first so backend enforcement and frontend verification navigation switch together, completes staging verification, and only then changes production to `true`.

Operator prerequisites that GitHub cannot establish are: the zone is authoritative in Cloudflare DNS and contains the sending domain, `CLOUDFLARE_API_TOKEN` has Email Sending edit permission, and the account plan permits the intended recipients.

### Runtime Secret Synchronization

The application workflow synchronizes required Worker secrets before each Wrangler deploy. Backend secrets include Better Auth, Stripe, Cloudflare account and RealtimeKit values, plus `CLOUDFLARE_RUNTIME_API_TOKEN` under the Worker secret name `CLOUDFLARE_API_TOKEN`. Notification-orchestrator receives its required Cloudflare account, RealtimeKit, and runtime-token secrets the same way. Postgres runtime access continues through Hyperdrive.

Pre-deploy synchronization is part of the bootstrap contract, not a post-deploy cleanup step. A secret synchronization failure stops the deployment before Wrangler publishes the application script.

### Setup and Deployment Runbook

1. Create both required GitHub Environments and apply their branch restrictions.
2. Copy the matching template (`cp .env.staging.example .env.staging` or `cp .env.production.example .env.production`), fill it, then run `make bootstrap-staging .env.staging` or `make bootstrap-production .env.production`. The target exports the file into the one-time idempotent bootstrap, which creates/verifies the Neon project, Hyperdrive config, queues, R2 buckets with lifecycle rules, and Email Sending domain.
3. On a fresh Neon project, paste the `DATABASE_URL` the bootstrap prints back into the same gitignored file, re-run bootstrap (it creates the Hyperdrive config from that direct URI — Hyperdrive itself provides pooling, so no separate pooled URI is needed), set `HYPERDRIVE_ID` from the summary, then run `make envs-staging .env.staging` or `make envs-production .env.production`. That uploads every known GitHub secret and the three non-secret environment variables.
4. Grant the single `CLOUDFLARE_API_TOKEN` only the account and zone permissions needed by the bootstrap script and Wrangler. Keep `CLOUDFLARE_RUNTIME_API_TOKEN` least-privileged for runtime calls.
5. Set `AUTH_EMAIL_VERIFICATION_ENFORCED=false` until Email Service delivery is verified.
6. Run migrations once per fresh environment (`pnpm db:migrate` with the environment's `DATABASE_URL`).
7. Merge to `staging` or `main`, or dispatch `.github/workflows/deploy.yml` from the matching branch and environment. Do not dispatch the reusable workflows directly.
8. Observe one run in this order: environment guard → migrations → notification-orchestrator → backend-rest (+ redaction reassert) → greedy-matcher → frontend.

### Email Verification Deployment Gate

- **Deployment A (`AUTH_EMAIL_VERIFICATION_ENFORCED=false`)**: run `scripts/bootstrap.sh` (provisions Email Service and verifies readiness), then deploy the bindings, verify `preview_enabled=false` and `drop_suppressed_recipients=false`, validate Cloudflare-managed DNS and sender restrictions, perform a controlled staging send, and confirm the post-deploy redaction reassert ran.
- **Deployment B (`AUTH_EMAIL_VERIFICATION_ENFORCED=true`)**: the same application workflow enables backend enforcement and builds the frontend verification flow from the same validated value, then verifies the complete signup/verification/login flow in staging before promoting the contract to production and running the controlled canary.

The application pipeline is not independently ordered by an operator: `.github/workflows/deploy.yml` establishes the job ordering. The operator controls only the false-to-true environment-variable promotion after Deployment A evidence passes. Rollback changes `AUTH_EMAIL_VERIFICATION_ENFORCED` back to `false` and redeploys both backend and frontend behavior together while leaving proven Email Service infrastructure in place.

### Terraform Retirement

The Terraform stack was removed from the repository; `scripts/bootstrap.sh` plus committed Wrangler configs own provisioning and deployment. Frozen-state recovery: the last Terraform state snapshots live in each account's `mako-terraform-state` R2 bucket (object key `mako/terraform.tfstate`). Staging's `TF_STATE_R2_*` GitHub secrets are removed; production's remain until after its cutover and a two-week soak period, after which the buckets and the bucket-scoped R2 tokens are deleted manually (TASK-026).

### Troubleshooting

- **Missing configuration**: confirm the value exists in the selected GitHub Environment, including required `NEON_API_KEY`, `HYPERDRIVE_ID`, `VITE_AUTH_BASE_URL`, and all three non-secret variables.
- **Manual deployment rejected**: dispatch from `staging` with `staging`, or from `main` with `production`.
- **Email Sending not ready**: inspect Email Sending domain/DNS state; re-run `scripts/bootstrap.sh` (its readiness poll is part of every run). Do not start the backend deployment until the domain reports enabled.
- **Wrangler authentication failure**: verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` belong to the same selected environment.
- **Worker runtime authentication failure**: verify pre-deploy synchronization used `CLOUDFLARE_RUNTIME_API_TOKEN` for the Worker secret named `CLOUDFLARE_API_TOKEN`.
- **Backend runtime configuration failure**: verify Hyperdrive rendering and the required Better Auth, Stripe, Email, and enforcement bindings.
- **Frontend auth failure**: verify `VITE_AUTH_BASE_URL` points to the selected environment's deployed backend.
- **Redaction reassert failure**: `scripts/ensure-redact-query-string.sh` failed to set/verify `redact_query_string`; stop promotion, inspect the script error, and rerun the backend deploy job. Do not bypass the redaction step.

## Pull Request Guidelines

To maintain a clean and traceable history, all pull requests must adhere to the following standards:

### Merge Strategy

- **Squash and Merge**: All commits in a pull request will be squashed into a single, clean commit when merged into the main branch.

### Commit Standards

- **Clarity**: Even though commits are squashed on merge, every individual commit within a pull request must have a clear, descriptive title and body.
- **Verification**: This ensures that the development process is transparent and that individual changes can be verified against the final pull request description.

### PR Title

- **Format**: `[MILESTONE-TICKETID] Short description of changes`
- **Requirement**: The title must always include the relevant ticket number or name.

Example: `[2-1.4]-Implementing API Route`

### PR Description

Every pull request description must include the following sections:

1. **What**: A clear and concise explanation of the changes introduced.
2. **Why**: The rationale behind these changes and the problem they solve.
3. **Testing**: A description of the new tests added and the testing performed (e.g., manual verification, unit tests).
4. **Documentation**: Any updates or additions required for the project documentation.

For each section:

- Use concise bullet points
- Be clear in what was done

Example Format

```
(Title)
TICKET-1: Creating Initial Authentication Routes

(Description)
WHAT
- Creating sign up route
- Creating sign out route
- Creating sign in route

WHY
- We want a user to be able to sign in with their own account
- This will allow us to support adding extra profile information for each user

TESTING
- Added integration tests
- Added unit tests

DOCUMENTATION
- Added to openapi spec

```

## Pull Request Checklist

When creating a pull request make sure the following is **ALWAYS** done.

- [ ] Pull the latest version from main, handling any rebase errors. If you are not sure how to handle a case, ask for confirmation on what to do.
- [ ] Pnpm lint returns no warnings/errors
- [ ] In the related ticket document in @stories, set the `status` to `done`
