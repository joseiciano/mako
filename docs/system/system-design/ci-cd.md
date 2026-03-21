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
  - Steps: deploy backend and frontend workers through `cloudflare/wrangler-action`

### Secrets Management Strategy

Secrets are managed in GitHub as environment-scoped secrets (for example, `staging` and `production`) with the same secret keys in each environment, then consumed by deployment workflows.

Core secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL`
- `NEON_API_KEY`
- `STRIPE_SECRET_KEY`

Optional secrets (enabled when corresponding runtime features are introduced):

- `NEON_DATABASE_URL`
- `STRIPE_WEBHOOK_SECRET`

Secret sync behavior:

- Terraform workflow consumes Cloudflare/Neon/Stripe secrets during infra apply.
- Backend deploy uses Wrangler action secret sync to set Worker runtime secrets (`DATABASE_URL`, `STRIPE_SECRET_KEY`).
- Frontend deploy only requires Cloudflare deployment credentials.

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

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL`
- `NEON_API_KEY`
- `STRIPE_SECRET_KEY`

Optional secrets (add when feature is enabled):

- `NEON_DATABASE_URL`
- `STRIPE_WEBHOOK_SECRET`

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
- **Wrangler auth/account failures**: verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` match the same account.
- **Terraform apply skipped**: no `*.tf` files found in `infrastructure/` (current workflow behavior).
- **Backend runtime missing DB/Stripe access**: verify `DATABASE_URL` and `STRIPE_SECRET_KEY` and confirm Wrangler secret sync step succeeded.

## Pull Request Guidelines

To maintain a clean and traceable history, all pull requests must adhere to the following standards:

### Merge Strategy

- **Squash and Merge**: All commits in a pull request will be squashed into a single, clean commit when merged into the main branch.

### Commit Standards

- **Clarity**: Even though commits are squashed on merge, every individual commit within a pull request must have a clear, descriptive title and body.
- **Verification**: This ensures that the development process is transparent and that individual changes can be verified against the final pull request description.

### PR Title

- **Format**: `[TICKET-ID/NAME] Short description of changes`
- **Requirement**: The title must always include the relevant ticket number or name.

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
