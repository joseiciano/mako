# CI/CD & Development Workflow

## GitHub Actions

We utilize GitHub Actions for our CI/CD pipeline to ensure code quality and automate deployments.

- **Linting & Type Checking**: Automated checks run on every push and pull request to enforce coding standards and catch errors early.
- **Automated Deployment**: Successful merges to the main branch trigger automated deployments to our staging and production environments.

### Workflow Files

- **Quality Gate** (`.github/workflows/quality-gate.yml`)
  - Trigger: every pull request targeting `main`
  - Steps: install dependencies, run `pnpm lint`, `pnpm typecheck`, and `pnpm test`
- **Infrastructure Deployment** (`.github/workflows/deploy-infrastructure.yml`)
  - Trigger: pushes to `main` that modify `infrastructure/**`
  - Steps: `terraform init`, `terraform validate`, and `terraform apply -auto-approve`
- **Application Deployment** (`.github/workflows/deploy-applications.yml`)
  - Trigger: pushes to `main` that modify app/shared code paths
  - Steps: migrate production database, then deploy backend-rest, notification-orchestrator, and frontend workers through `cloudflare/wrangler-action`
  - Migration requirements:
    - Production migrations must be backward-compatible because the database is migrated before the backend deploys.
    - The `DATABASE_URL` secret used by CI must target the same database as the production Hyperdrive binding.
    - Using a dedicated migration credential for `DATABASE_URL` is preferred.
    - Production environment approvals are recommended for schema-changing releases.

### Secrets Management Strategy

Secrets are managed in GitHub as environment-scoped secrets (for example, `staging` and `production`) with the same secret keys in each environment, then consumed by deployment workflows.

Each environment (`staging`, `production`) defines the same secret keys; values differ per environment. Two scripts configure them:

- `scripts/set-github-env-secrets.sh` — interactive; prompts for each value. Use for manual setup.
- `scripts/set-github-env-secrets-from-env.sh <staging|production> [path/to/.env]` — batch; parses a `.env` file (`KEY=VALUE` lines) and uploads every known secret, skipping unknown keys.

Keep both scripts in sync with the inventory tables below. When configuring secrets from an existing `.env` file, prefer the batch script.

Infrastructure and Terraform state:

| Secret | Purpose | Format / example |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID of this environment's account | 32-character account ID (e.g. `e7d95c90bfc96c0320a2a51bc889461a`) |
| `CLOUDFLARE_TERRAFORM_API_TOKEN` | Account API token Terraform uses to manage Workers, Queues, R2, Hyperdrive, and Workflows | `cfat_…` with Account Settings Read + Workers Scripts, R2, Queues, Hyperdrive Write |
| `NEON_API_KEY` | Neon API key Terraform uses to manage the project, role, and database | Neon API key |
| `NEON_ORG_ID` | Neon organization ID the Terraform project belongs to | `org-…` |
| `TF_STATE_R2_ACCESS_KEY_ID` | Access Key ID of the bucket-scoped R2 token for `mako-terraform-state` (Object Read & Write) | 32-character access key |
| `TF_STATE_R2_SECRET_ACCESS_KEY` | Secret Access Key of the same R2 token | shown once at token creation |

Applications:

| Secret | Purpose | Format / example |
|---|---|---|
| `CLOUDFLARE_DEPLOY_API_TOKEN` | Account API token for Wrangler deploys in CI only; never exposed to Workers | `cfat_…` scoped to Workers deployments |
| `CLOUDFLARE_RUNTIME_API_TOKEN` | Account API token used by Workers at runtime; synced as the Worker secret `CLOUDFLARE_API_TOKEN` | `cfat_…` with minimal RealtimeKit scopes |
| `DATABASE_URL` | Direct SSL Neon migration URI from `terraform output database_url`; contains credentials | `postgresql://mako_app:***@ep-…neon.tech:5432/mako?sslmode=require&channel_binding=require` |
| `HYPERDRIVE_ID` | Hyperdrive config ID from `terraform output hyperdrive_id`; replaces `__HYPERDRIVE_ID__` placeholders | 32-hex |
| `BETTER_AUTH_SECRET` | Better Auth signing secret | long random string (≥32 chars) |
| `BETTER_AUTH_URL` | Backend base URL Better Auth uses | `https://mako-backend-rest.<subdomain>.workers.dev` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Comma-separated origins allowed by Better Auth for this environment | `https://<frontend>,https://<backend>` |
| `VITE_AUTH_BASE_URL` | Backend origin baked into the frontend at build time; same value as `BETTER_AUTH_URL` | URL |
| `CLOUDFLARE_REALTIMEKIT_APP_ID` | RealtimeKit application ID belonging to this environment's Cloudflare account | RealtimeKit app ID |
| `STRIPE_SECRET_KEY` | Stripe secret key for this environment | `sk_test_…` in staging, `sk_live_…` in production |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret for the backend `/api/payments/webhook` endpoint | `whsec_…` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key baked into the frontend | `pk_test_…` in staging, `pk_live_…` in production |

Secret sync behavior:

- Terraform workflow consumes Cloudflare/Neon/Stripe secrets during infra apply.
- Backend deploy injects `HYPERDRIVE_ID` into `apps/backend-rest/wrangler.jsonc` before deployment and syncs Worker runtime secrets (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `STRIPE_SECRET_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_REALTIMEKIT_APP_ID`). Postgres runtime access is provided through the Cloudflare Hyperdrive binding.
- Notification orchestrator deploy also injects `HYPERDRIVE_ID` into `apps/notification-orchestrator/wrangler.jsonc` before deployment and syncs Worker runtime secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_REALTIMEKIT_APP_ID`) for fresh RealtimeKit recording status and short-lived download URL lookup. Postgres runtime access is provided through the Cloudflare Hyperdrive binding.
- Frontend deploy requires Cloudflare deployment credentials and `VITE_AUTH_BASE_URL`, which is injected at build time so the auth client knows the backend origin. The checkout feature also needs `VITE_STRIPE_PUBLISHABLE_KEY` injected at build time so the Stripe Payment Element can initialize.

## CI/CD Setup Runbook

This runbook explains how the CI/CD workflows operate and what must be configured in GitHub.

### Required GitHub Configuration

#### 1) Create Environments

In GitHub repository settings:

1. Go to **Settings → Environments**.
2. Create environments:
   - `production` (required)
   - `staging` (optional now, recommended)
3. Add protection rules for `production` as needed (reviewers, wait timers, etc.).

> All current deploy workflows target the `production` environment.

#### 2) Add Environment Secrets

Add these under **Settings → Environments → production → Secrets and variables → Actions**.

Core secrets (required):

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_TERRAFORM_API_TOKEN`
- `CLOUDFLARE_DEPLOY_API_TOKEN`
- `CLOUDFLARE_RUNTIME_API_TOKEN`
- `NEON_API_KEY`
- `NEON_ORG_ID`
- `TF_STATE_R2_ACCESS_KEY_ID`
- `TF_STATE_R2_SECRET_ACCESS_KEY`
- `DATABASE_URL`
- `HYPERDRIVE_ID`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `CLOUDFLARE_REALTIMEKIT_APP_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `VITE_STRIPE_PUBLISHABLE_KEY`

Secret sync behavior:

- Terraform workflow consumes Cloudflare/Neon/Stripe secrets during infra apply.
- Backend deploy injects `HYPERDRIVE_ID` into `apps/backend-rest/wrangler.jsonc` before deployment and syncs Worker runtime secrets (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `STRIPE_SECRET_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_RUNTIME_API_TOKEN`, `CLOUDFLARE_REALTIMEKIT_APP_ID`). Postgres runtime access is provided through the Cloudflare Hyperdrive binding.
- Notification orchestrator deploy also injects `HYPERDRIVE_ID` into `apps/notification-orchestrator/wrangler.jsonc` before deployment and syncs Worker runtime secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_RUNTIME_API_TOKEN`, `CLOUDFLARE_REALTIMEKIT_APP_ID`) for fresh RealtimeKit recording status and short-lived download URL lookup. Postgres runtime access is provided through the Cloudflare Hyperdrive binding.
- Frontend deploy requires Cloudflare deployment credentials and `VITE_AUTH_BASE_URL`, which is injected at build time so the auth client knows the backend origin. The checkout feature also needs `VITE_STRIPE_PUBLISHABLE_KEY` injected at build time so the Stripe Payment Element can initialize.

#### 3) Verify Cloudflare Token Scope

Use a least-privilege Cloudflare API token that can deploy Workers and manage only the resources Terraform needs.

#### 4) Merge and Observe

1. Open a PR and verify **Quality Gate** passes.
2. Merge to `main`:
   - `infrastructure/**` changes trigger **Deploy Infrastructure**.
   - app/package path changes trigger **Deploy Applications**.
3. Check Actions logs for missing secrets, Terraform failures, or Wrangler deploy errors.

### Troubleshooting

- **Missing secret errors**: secret is absent or misnamed in the `production` environment.
- **Wrangler auth/account failures**: verify `CLOUDFLARE_DEPLOY_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` match the same account.
- **Terraform apply skipped**: no `*.tf` files found in `infrastructure/` (current workflow behavior).
- **Backend runtime missing DB/Stripe/auth access**: verify `HYPERDRIVE_ID` was injected into `wrangler.jsonc`, confirm the deployed Worker has the `HYPERDRIVE` binding, then verify `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, and `STRIPE_SECRET_KEY` and confirm Wrangler secret sync succeeded.
- **Frontend build or runtime auth errors**: verify `VITE_AUTH_BASE_URL` is set and points to the deployed backend-rest Worker URL.

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
