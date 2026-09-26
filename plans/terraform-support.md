---
goal: Deploy isolated staging and production stacks through Terraform and GitHub Actions
date_created: 2026-09-09
last_updated: 2026-09-13
status: In Progress
tags: [infrastructure, terraform, cloudflare, neon, github-actions, deployment]
---

# Introduction

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-yellow)

This plan defines a clean rebuild into two independently deployable environments: `staging` and `production`. Each environment uses a separate Cloudflare account, a separate Neon project, a separate GitHub Environment, and an isolated R2 Terraform state backend.

The current Terraform state, Cloudflare resources, and Neon databases are disposable and are not migration inputs to this plan. Completion delivers two reproducible environment stacks and the promotion path feature branch → `staging` → `main`, where `main` is the production branch.

## Current State

- Terraform in `infrastructure/` provisions one complete environment per state, selected by the required `var.environment` value (`staging` or `production`).
- Each invocation creates one environment-specific Neon project, one explicit application role and database, and one Hyperdrive configuration wired to those credentials.
- Terraform provisions non-Worker resources plus Worker identity/observability settings and references them from split Worker resources; committed Wrangler configuration mirrors the application-facing bindings after bootstrap.
- Deployment workflows previously targeted only the `production` GitHub Environment; the accepted contract uses both required `staging` and `production` environments through one orchestrator.
- Application Wrangler configurations use stable account-scoped Worker, R2 bucket, Queue, Workflow, and rate-limiter names. Those names can be reused in separate Cloudflare accounts.
- Wrangler deployment replaces the `__HYPERDRIVE_ID__` placeholder with the selected environment's Hyperdrive ID.
- `infrastructure/backend.tf` activates a partial S3 backend. `infrastructure/backend-r2.hcl.example` defines the non-secret R2 endpoint and S3 lockfile contract; CI does not yet render an environment-specific backend configuration.
- `scripts/set-github-env-secrets.sh` accepts the target `staging` and `production` environments, but does not configure all infrastructure and Terraform-state credentials.
- The repository has only the `main` deployment branch.

## 1. Requirements & Constraints

- **REQ-001**: Provision exactly two environments named `staging` and `production` from the same Terraform configuration.
- **REQ-002**: Assign each environment its own Cloudflare account, GitHub Environment, Neon project, and remote Terraform state.
- **REQ-003**: Create exactly one Neon project, application role, database, and Hyperdrive configuration in each Terraform state.
- **REQ-004**: Name Neon projects `${var.project_name}-${var.environment}` so projects remain distinct when environments use the same Neon organization.
- **REQ-005**: Reuse existing account-scoped Cloudflare resource names across the separate accounts, including `mako-recordings`, `mako-screenshots`, Worker names, Queue names, Workflow names, and rate-limiter namespace IDs.
- **REQ-006**: Route pushes from `staging` to the `staging` GitHub Environment and pushes from `main` to the `production` GitHub Environment.
- **REQ-007**: Support manual deployment through a required `workflow_dispatch` choice containing `staging` and `production`.
- **REQ-008**: Reject a manual deployment when the selected environment does not match the dispatched branch: `staging`/`staging` or `production`/`main`.
- **REQ-009**: Run database migrations with the `DATABASE_URL` from the selected GitHub Environment before deploying database-dependent Workers.
- **REQ-010**: Inject the selected environment's `HYPERDRIVE_ID` into the existing `__HYPERDRIVE_ID__` Wrangler placeholders. No environment-specific resource-name templating is required.
- **REQ-011**: Expose singular Terraform outputs for `hyperdrive_id`, `database_url`, `neon_project_id`, and `neon_database_host`; mark the connection URL sensitive.
- **REQ-012**: Serialize the complete infrastructure → readiness → migration → application → settings-reconciliation deployment for one environment while allowing staging and production deployments to run independently.
- **REQ-013**: Configure environment-specific application origins and provider credentials, including Better Auth, frontend API origin, Stripe, and RealtimeKit values.
- **REQ-014**: Stop an application deployment when Terraform has recreated Neon or Hyperdrive and the selected GitHub Environment still contains stale `DATABASE_URL` or `HYPERDRIVE_ID` values.
- **REQ-015**: Require a successful staging deployment for the exact staging commit before that commit may be promoted to `main`.
- **REQ-016**: Confirm infrastructure readiness with a bounded Terraform refresh/poll after apply; a single immediate output assertion is not a readiness gate.
- **REQ-017**: Synchronize every Worker's required runtime secrets before its Wrangler deployment, including for fresh bootstrap Workers.
- **REQ-018**: Reassert Terraform-owned Worker identity/observability settings through a post-deploy infrastructure reconciliation apply after every application deployment.
- **SEC-001**: Use one environment-scoped CI token named `CLOUDFLARE_API_TOKEN` for both the Terraform provider and Wrangler; keep the separate least-privilege `CLOUDFLARE_RUNTIME_API_TOKEN` for Worker runtime API access. Scope every token to its target account and use bucket-scoped R2 credentials for the corresponding Terraform-state bucket.
- **SEC-002**: Require an approved, protected `staging` → `main` pull request before production deployment. GitHub Environment required-reviewer gates are not part of this private personal-account repository design.
- **SEC-003**: Never write backend credentials, Terraform variables containing secrets, database URLs, or generated backend configuration containing secrets to the repository.
- **SEC-004**: Prevent staging credentials from reading or modifying production Terraform state.
- **CON-001**: The current stack is disposable. Do not migrate, import, retain, or recover its Terraform state or Neon data as part of this cutover.
- **CON-002**: Create each Terraform-state R2 bucket outside the application Terraform stack because Terraform cannot store state in a bucket before that bucket exists.
- **CON-003**: Terraform owns persistent non-Worker Cloudflare resources and Worker identity/observability settings, including query-string redaction, through the split Worker resources. Terraform creates only the first bootstrap version/deployment; Wrangler owns application Worker versions, bindings, triggers, and runtime secrets afterward.
- **CON-004**: Do not rely on `ignore_changes` over script content. After Wrangler deploys an application, the orchestrator invokes Terraform again to reassert Worker identity/observability settings without uploading code or replacing Wrangler's version/deployment.
- **CON-005**: Do not add an ORM; database access and migrations continue using the repository's SQL-based infrastructure.
- **CON-006**: Cloudflare R2 does not expose S3 bucket versioning through its S3 compatibility API. State versioning is not required for this disposable cutover, and R2 bucket locks must not cover the live state or `.tflock` keys because Terraform must overwrite and delete them.
- **GUD-001**: Declare `var.environment` without a default so an omitted value cannot silently target production.
- **GUD-002**: Resolve the deployment environment once in the orchestrator and pass it to each reusable infrastructure and application invocation, including the post-deploy settings-reconciliation invocation.
- **PAT-001**: Use the same environment names everywhere: Terraform input, GitHub Environment, branch mapping, job output, logs, and documentation.

## 2. Implementation Steps

### Implementation Phase 1: Convert Terraform to one complete environment per state

- **GOAL-001**: Make one Terraform invocation provision one deterministic environment.

- [x] **TASK-001**: Add a required `environment` variable to `infrastructure/variables.tf`.
  - Accept only `staging` and `production` through a Terraform validation block.
  - Do not define a default.
- [x] **TASK-002**: Remove `local.environments` and all environment `for_each` expressions from `infrastructure/main.tf`.
  - Convert `neon_project.db`, `neon_role.app`, `neon_database.app`, and `cloudflare_hyperdrive_config.postgres` into singular resources.
  - Name the Neon project `${var.project_name}-${var.environment}`.
  - Name the Hyperdrive configuration `${var.project_name}-${var.environment}-hyperdrive` for operator clarity even though the name is account-scoped.
- [x] **TASK-003**: Replace all `cloudflare_hyperdrive_config.postgres["production"].id` bindings with `cloudflare_hyperdrive_config.postgres.id`.
  - Update `cloudflare_workers_script.notification_orchestrator`.
  - Update `cloudflare_workers_script.backend_api`.
  - Update `cloudflare_workers_script.greedy_matcher`.
- [x] **TASK-004**: Convert collection outputs in `infrastructure/outputs.tf` into singular outputs.
  - Add `hyperdrive_id` from `cloudflare_hyperdrive_config.postgres.id`.
  - Add sensitive `database_url` as a direct, SSL-required URI for the explicit `neon_role.app` and `neon_database.app`; do not use the Neon pooler URI for migrations.
  - Add `neon_project_id` and direct `neon_database_host`.
  - Remove `hyperdrive_ids`, `neon_project_ids`, and `neon_connection_uris` after all callers are migrated.
- [x] **TASK-005**: Remove the unused Terraform `realtime_app_id` input and `realtime_binding` output.
  - Keep `CLOUDFLARE_REALTIMEKIT_APP_ID` as a GitHub Environment secret synchronized by Wrangler.
  - Update `infrastructure/terraform.tfvars.example` and `infrastructure/README.md` to remove the obsolete Terraform input.
- [x] **TASK-006**: Retain existing Cloudflare resource-name variables and defaults.
  - Do not add environment suffixes to R2 buckets, Queues, Workers, Workflows, or rate-limiter namespace IDs because each environment uses a separate Cloudflare account.
  - Document that Neon project names remain environment-specific because their namespace is the Neon organization rather than the Cloudflare account.

- [x] **TASK-041**: Wire the explicit Neon role and database into every connection path.
  - Configure Hyperdrive with `neon_project.db.database_host`, `neon_database.app.name`, `neon_role.app.name`, and `neon_role.app.password` rather than the default database credentials returned by `neon_project.db`.
  - Construct `database_url` from the same host, role, password, and database so migrations and Hyperdrive always target the same database.
  - URL-encode credentials and include the required Neon TLS query parameters.
- [x] **TASK-042**: Reconcile Terraform and Wrangler ownership before creating either environment.
  - Add `InterviewFeedbackWorkflow` and `RecordingFinalizationWorkflow` exports to `infrastructure/workers/notification-orchestrator.js` so every Terraform-created Workflow class exists during a fresh apply.
  - Replace the unused `cloudflare_workflow.interview_lifecycle` resource and `INTERVIEW_WORKFLOW` binding with `cloudflare_workflow.session_timer`, named `session-timer-workflow`, targeting the backend Worker and class `SessionTimerWorkflow`.
  - Add a matching bootstrap `SessionTimerWorkflow` export to `infrastructure/workers/backend-api.js`, remove the obsolete `interview_workflow_name` and `interview_workflow_class_name` variables, and remove or update the `workflow_name` output so it no longer references `interview_lifecycle`.
  - Represent `PREMIUM_MARKETPLACE_RATE_LIMITER` in the backend bootstrap binding set and keep namespace ID `1001` mirrored in Wrangler.
  - Add the notification-orchestrator scheduled trigger to Terraform and align its Queue consumer batch timeout, retry count, retry delay, and dead-letter Queue with `apps/notification-orchestrator/wrangler.jsonc`.
  - Adopt the split Worker resource model: `cloudflare_worker` identities with Terraform-owned identity/observability settings, plus `cloudflare_worker_version`/`cloudflare_workers_deployment` only for the first bootstrap version/deployment. Do not carry legacy script-content `ignore_changes`; the post-deploy settings-reconciliation invocation reasserts identity settings instead.
  - Wrangler owns application versions, bindings, triggers, and script content after bootstrap; committed Wrangler configuration carries the application-facing bindings, and Terraform must not overwrite a later Wrangler version/deployment.
### Implementation Phase 2: Activate isolated R2 remote state

- **GOAL-002**: Give each environment an independently authenticated remote state backend.

- [x] **TASK-007**: Activate the partial S3 backend configuration.
  - Create `infrastructure/backend.tf` containing only `terraform { backend "s3" {} }`.
  - Remove `infrastructure/backend.tf` from `.gitignore` so the non-secret backend declaration is committed.
  - Delete `infrastructure/backend.tf.example` after the committed backend declaration replaces it.
  - Keep `infrastructure/backend-r2.hcl` and `infrastructure/backend.ci.hcl` ignored.
- [x] **TASK-008**: Update `infrastructure/backend-r2.hcl.example` to match the Cloudflare R2 backend contract.
  - Use bucket `mako-terraform-state` and key `mako/terraform.tfstate`.
  - Use region `auto`.
  - Include `skip_credentials_validation`, `skip_metadata_api_check`, `skip_region_validation`, `skip_requesting_account_id`, `skip_s3_checksum`, and `use_path_style`.
  - Configure `endpoints = { s3 = "https://<cloudflare-account-id>.r2.cloudflarestorage.com" }`; Terraform backend configuration cannot reference variables, so operator and CI scripts must render the selected environment's concrete account ID into their ignored backend files. Do not use the deprecated top-level `endpoint` argument.
  - Do not include access keys in the file.
- [x] **TASK-009**: Enable S3 lockfile state locking with Terraform 1.10.0 or newer.
  - Set `use_lockfile = true` in the backend configuration.
  - Set `required_version = ">= 1.10.0, < 2.0.0"` in `infrastructure/versions.tf`.
  - Pin Terraform `1.10.5` in CI so the deployment does not use the first `use_lockfile` implementation from `1.10.0`.
- [ ] **TASK-010**: Bootstrap one `mako-terraform-state` R2 bucket in each Cloudflare account outside Terraform.
  - Create a bucket-scoped R2 API token with Object Read & Write permission for each state bucket.
  - Store its Access Key ID and Secret Access Key in the corresponding GitHub Environment and in the operator's credential manager because GitHub secrets cannot be read back.
  - Never manage the state bucket from the Terraform state stored inside it.
  - Do not enable an R2 bucket lock over `mako/terraform.tfstate` or `mako/terraform.tfstate.tflock`.
- [x] **TASK-011**: Remove the committed `infrastructure/tfplan` artifact from source control.
  - Continue ignoring `*.tfplan` through `.gitignore`.

### Implementation Phase 3: Configure GitHub Environments and secrets

- **GOAL-003**: Make a selected GitHub Environment contain every value required to provision and deploy its stack.

- [ ] **TASK-012**: Create GitHub Environments named `staging` and `production`.
  - Restrict the `staging` environment to the `staging` branch and the `production` environment to the `main` branch through GitHub Environment deployment branch policies.
  - Do not configure required reviewers: GitHub does not offer that protection rule for this private personal-account repository. Production approval is the protected promotion pull request in TASK-031.
- [ ] **TASK-030**: Create `staging` from `main`.
  - Run `git switch main && git switch -c staging && git push -u origin staging`.
  - Create each new feature branch from the latest `staging` branch.
- [ ] **TASK-013**: Store the following infrastructure secrets in every GitHub Environment.
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`
  - `NEON_API_KEY`
  - `NEON_ORG_ID`
  - `TF_STATE_R2_ACCESS_KEY_ID`
  - `TF_STATE_R2_SECRET_ACCESS_KEY`
- [ ] **TASK-014**: Store the following application secrets in every GitHub Environment.
  - `CLOUDFLARE_RUNTIME_API_TOKEN`
  - `DATABASE_URL`
  - `HYPERDRIVE_ID`
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `BETTER_AUTH_TRUSTED_ORIGINS`
  - `VITE_AUTH_BASE_URL`
  - `CLOUDFLARE_REALTIMEKIT_APP_ID`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `VITE_STRIPE_PUBLISHABLE_KEY`
  - Also define the non-secret environment variables `EMAIL_SENDING_ZONE_ID`, `EMAIL_SENDING_DOMAIN`, and `AUTH_EMAIL_VERIFICATION_ENFORCED` (exact `true`/`false`, initially `false`); they are GitHub Environment variables, not secrets.
- [ ] **TASK-015**: Update `scripts/set-github-env-secrets.sh` to configure a complete environment.
  - Accept `staging` and `production`.
  - Support every secret from TASK-013 and TASK-014.
  - Remove unused `R2_BUCKET_NAME`, `R2_ACCOUNT_ID`, and `NEON_DATABASE_URL` inventory entries from the script and documentation.
  - Continue setting values on the selected GitHub Environment rather than repository-wide secrets.
- [ ] **TASK-016**: Implement the operator-run post-Terraform output handoff.
  - Set `ENVIRONMENT` to the GitHub Environment that was just provisioned, authenticate `gh` for `joseiciano/mako`, and load that environment's R2 credentials from the operator credential manager into `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
  - Generate the non-secret environment backend file and run `terraform -chdir=infrastructure init -reconfigure -backend-config=backend-r2.hcl` before reading outputs.
  - Run `terraform -chdir=infrastructure output -raw hyperdrive_id | gh secret set HYPERDRIVE_ID --repo joseiciano/mako --env "$ENVIRONMENT"`.
  - Run `terraform -chdir=infrastructure output -raw database_url | gh secret set DATABASE_URL --repo joseiciano/mako --env "$ENVIRONMENT"` so the sensitive value is passed through standard input rather than printed.
  - Repeat this synchronization whenever the Neon project or Hyperdrive configuration is recreated, then rerun the orchestrator for the same branch and environment.

### Implementation Phase 4: Route Terraform deployments safely

- **GOAL-004**: Make infrastructure deployment select exactly one account, state backend, and Terraform environment.

- [ ] **TASK-017**: Create `.github/workflows/deploy.yml` as the only push and manual deployment entry point.
  - Trigger on relevant infrastructure, application, package, lockfile, and deployment-workflow changes pushed to `staging` or `main`.
  - Add the required `workflow_dispatch.inputs.environment` choice with `staging` and `production`.
  - Resolve `staging` branch to `staging` and `main` branch to `production`; fail an unsupported branch or manual branch/environment mismatch before invoking an environment-bearing job.
  - Expose the resolved environment once and pass it as a required input to the reusable infrastructure and application workflows.
- [ ] **TASK-018**: Serialize the complete deployment at the orchestrator workflow level.
  - Concurrency groups remain branch/environment-scoped at the orchestrator level so the same environment serializes deployments and different environments may proceed independently.
  - Invoke infrastructure bootstrap/apply first, applications only through `needs`, then post-deploy infrastructure settings reconciliation after applications succeed.
- [ ] **TASK-019**: Convert `.github/workflows/deploy-infrastructure.yml` into a reusable `workflow_call` workflow with a required `environment` input.
  - Select the input GitHub Environment on the Terraform job.
  - `TF_VAR_environment=${{ inputs.environment }}`
  - `TF_VAR_cloudflare_account_id=${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`
  - `TF_VAR_cloudflare_api_token=${{ secrets.CLOUDFLARE_API_TOKEN }}`
  - `TF_VAR_neon_api_key=${{ secrets.NEON_API_KEY }}`
  - `TF_VAR_neon_org_id=${{ secrets.NEON_ORG_ID }}`
- [ ] **TASK-020**: Map R2 backend credentials independently from Terraform variables.
  - `AWS_ACCESS_KEY_ID=${{ secrets.TF_STATE_R2_ACCESS_KEY_ID }}`
  - `AWS_SECRET_ACCESS_KEY=${{ secrets.TF_STATE_R2_SECRET_ACCESS_KEY }}`
  - `AWS_REGION=auto`
  - Use `${{ secrets.CLOUDFLARE_ACCOUNT_ID }}` to construct the selected account's R2 S3 endpoint.
- [ ] **TASK-021**: Generate `backend.ci.hcl` on the GitHub runner and initialize it before Terraform validation, planning, or application.
  - Write only non-secret backend settings and `endpoints.s3`; credentials remain in `AWS_*` environment variables.
  - Run `terraform init -reconfigure -backend-config=backend.ci.hcl`.
  - Do not run `terraform workspace select`; backend credentials and endpoint already select the isolated environment state.
- [ ] **TASK-022**: Run Terraform checks and application in a deterministic sequence.
  - Run `terraform fmt -check -recursive`, `terraform validate`, `terraform plan -out=tfplan`, and `terraform apply tfplan`.
  - Include the selected environment in the job display name; do not add a second concurrency group inside the reusable workflow.
- [ ] **TASK-023**: Validate credentials and derived output synchronization.
  - Validate every infrastructure and backend secret before `terraform init`, failing with the missing secret name without printing values.
  - Verify the Terraform Cloudflare token can read the configured account before planning.
  - After apply, compare `hyperdrive_id` with the selected environment's `HYPERDRIVE_ID` and compare a SHA-256 digest of `database_url` with a digest of `DATABASE_URL`.
  - Fail with the stale secret names and TASK-016 remediation when either value differs; the orchestrator must not invoke the application workflow on this failure.

### Implementation Phase 5: Route application deployments safely

- **GOAL-005**: Deploy migrations and applications to the GitHub Environment selected by branch or manual input.

- [ ] **TASK-024**: Convert `.github/workflows/deploy-applications.yml` into a reusable `workflow_call` workflow with a required `environment` input.
  - Remove its push, manual-dispatch, resolver, and job-level concurrency configuration; `.github/workflows/deploy.yml` owns routing, serialization, and final settings reconciliation.
  - Select `${{ inputs.environment }}` as the GitHub Environment on migration, backend-rest, notification-orchestrator, and frontend jobs.
- [ ] **TASK-025**: Make every application job's dependency graph explicit.
  - Rename `migrate-production-db` to `migrate-db`.
  - Make both database-dependent Worker jobs (`deploy-backend-rest`, `deploy-notification-orchestrator`) depend directly on `migrate-db`.
  - Make the frontend deployment (`deploy-frontend`) depend on `deploy-backend-rest` so a new frontend is not published before its matching backend.
  - Preserve any additional dependency needed to deploy external Workflow classes before backend bindings reference them.
- [ ] **TASK-026**: Keep database migration behavior safe for sequential releases.
  - Run migrations before database-dependent Workers.
  - Require migrations shipped through this workflow to remain backward-compatible with the previously deployed Worker revision.
- [ ] **TASK-027**: Keep existing account-scoped Wrangler resource names and Hyperdrive injection.
  - Do not add Wrangler environments or duplicate per-environment configuration blocks.
  - Continue replacing every `__HYPERDRIVE_ID__` placeholder with the selected GitHub Environment's `HYPERDRIVE_ID`.
- [ ] **TASK-028**: Keep the CI token separate from Worker runtime credentials.
  - Authenticate `cloudflare/wrangler-action` with the environment-scoped CI secret `CLOUDFLARE_API_TOKEN`.
  - Map `CLOUDFLARE_RUNTIME_API_TOKEN` to the deployed Worker secret named `CLOUDFLARE_API_TOKEN`; do not expose the CI deployment token to Worker runtime code.
  - Synchronize every required secret before `wrangler deploy` rather than after, because Wrangler `secrets.required` must pass for a fresh bootstrap Worker.
  - Continue syncing the selected environment's `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, Better Auth values, Stripe values, and `HYPERDRIVE_ID` where each application consumes them.
- [ ] **TASK-029**: Validate environment-specific runtime configuration before deployment.
  - Require `BETTER_AUTH_URL` and required `VITE_AUTH_BASE_URL` to identify the selected backend's `/api/auth` URL.
  - Require every comma-separated `BETTER_AUTH_TRUSTED_ORIGINS` entry to be an allowed origin for the selected frontend; document that general API requests derive `/api` from `VITE_AUTH_BASE_URL` unless `VITE_API_BASE_URL` is deliberately added later.
  - Require Stripe `sk_test_`/`pk_test_` values in staging and `sk_live_`/`pk_live_` values in production without printing values.
  - Require a non-empty, environment-specific `STRIPE_WEBHOOK_SECRET` and register the matching backend `/api/payments/webhook` endpoint in Stripe.
  - Require each Cloudflare account's own RealtimeKit application ID.

### Implementation Phase 5a: Post-deploy settings reconciliation

- **GOAL-005A**: Guarantee Terraform-owned Worker settings after every application deployment.

- [ ] **TASK-043**: Add the post-deploy settings-reconciliation invocation.
  - The orchestrator invokes the reusable infrastructure workflow a second time after applications with `needs: [resolve-environment, applications]`, the same resolved environment, and the same commit SHA.
  - The reconciliation apply reasserts Worker identity/observability settings, including query-string redaction, without uploading code, replacing Wrangler bindings, or overwriting the deployed application version.
  - Fail the run if reconciliation cannot apply or verify the identity settings.
  - Dependencies: `TASK-018`, `TASK-019`.
  - Completion: every orchestrated deployment ends with Terraform-owned Worker identity settings verified.

### Implementation Phase 6: Establish staging-first feature development and production promotion

- **GOAL-006**: Make feature work flow through staging before production while preserving protected branch history.

- [ ] **TASK-031**: Protect `staging` and `main` with repository rulesets.
  - Require pull requests and the existing `Lint, Typecheck, and Test` check on both branches.
  - Require the `promotion-policy` check and at least one approving review on `main`.
  - Disallow direct pushes, force pushes, branch deletion, and administrator bypass on both branches.
  - Enable merge commits in repository settings; feature pull requests may still use squash merges, but promotion pull requests must use merge commits.
- [ ] **TASK-032**: Document and enforce the promotion path.
  - Merge completed feature branches into `staging`; feature pull requests may use squash merging.
  - Let the staging `Deploy` orchestrator run finish successfully for the resulting staging commit.
  - Promote `staging` to `main` only through an approved pull request whose head commit has a successful staging deployment.
  - Merge the `staging` → `main` promotion pull request with a merge commit, not squash or rebase, so staging commits remain ancestors of `main`.
- [ ] **TASK-033**: Implement the required `promotion-policy` job in `.github/workflows/quality-gate.yml`.
  - For pull requests targeting `main`, require `github.head_ref == 'staging'`.
  - Use read-only Actions/deployments API access to verify that the exact pull-request head SHA completed the staging `Deploy` orchestrator successfully.
  - Pass without the deployment lookup for pull requests targeting `staging`.
  - Route every normal, urgent, and emergency fix through `staging`; this plan intentionally defines no production-only bypass path.
  - Never reset or force-push a protected environment branch.

### Implementation Phase 7: Bootstrap and verify both environments

- **GOAL-007**: Recreate the full stack and prove environment isolation and promotion behavior.

- [ ] **TASK-034**: Explicitly abandon or destroy the current stack before bootstrap.
  - Do not migrate or retain its local Terraform state.
  - Confirm the target production Cloudflare account contains no same-named resources before applying the new production state; delete disposable conflicts manually when necessary.
- [ ] **TASK-035**: Bootstrap and apply the staging stack.
  - Create the staging account's state bucket and credentials.
  - Populate staging infrastructure and application secrets.
  - Dispatch the `Deploy` orchestrator from `staging`; the first run is expected to stop after Terraform while `HYPERDRIVE_ID` and `DATABASE_URL` are stale or absent.
  - Complete TASK-016, rerun the orchestrator, and require the full staging deployment to succeed.
- [ ] **TASK-036**: Repeat the complete infrastructure, output handoff, and application bootstrap for production from `main` only after staging passes.
- [ ] **TASK-037**: Execute the staging environment-isolation smoke tests in TEST-005 through TEST-007.
- [ ] **TASK-038**: Promote the verified staging revision through an approved `staging` → `main` pull request, deploy production, and execute the production smoke tests.
- [ ] **TASK-039**: Document minimal recovery for the new remote states.
  - Keep R2 state credentials recoverable in the operator credential manager and document credential rotation.
  - If a new state object is lost, either restore an independently stored encrypted `terraform state pull` snapshot when one exists or import/rebuild the disposable infrastructure into a new state.
  - Do not treat preservation or recovery of the pre-cutover stack as part of this procedure.
- [ ] **TASK-040**: Update infrastructure and CI/CD documentation with the final environment setup, Terraform/Wrangler ownership table, backend bootstrap, secret inventory, staging-first feature flow, production promotion, output resynchronization, and new-state recovery procedure.

## 3. Alternatives

- **ALT-001**: Store all environment states in one R2 bucket using Terraform CLI workspaces. Rejected because a shared credential can access every state and a workspace-selection error can apply one environment's inputs to another environment's state.
- **ALT-002**: Use Terraform Cloud workspaces. Rejected because the repository already contains an R2 backend pattern and adding Terraform Cloud introduces another service and a different workspace model.
- **ALT-003**: Deploy all environments to one Cloudflare account with resource suffixes. Rejected because separate accounts provide stronger credential, quota, resource, and blast-radius isolation and the account model is already decided.
- **ALT-004**: Preserve and migrate the current production Terraform state and Neon data. Rejected because the existing stack and databases are explicitly disposable for this cutover.
- **ALT-005**: Maintain a permanent shared development branch and deployed development stack. Rejected because feature work is validated on feature branches and in pull-request CI before it is merged into the shared staging environment; a third long-lived stack would add operational cost without a required promotion boundary.

## 4. Dependencies

- **DEP-001**: Two Cloudflare accounts with Workers, R2, Queues, Hyperdrive, Workflows, and RealtimeKit access enabled.
- **DEP-002**: One pre-created `mako-terraform-state` R2 bucket and bucket-scoped R2 API credential in each Cloudflare account.
- **DEP-003**: Neon organization access and an API key capable of creating one project per environment.
- **DEP-004**: GitHub repository administration access for Environments, secrets, deployment protection rules, branches, and branch protections.
- **DEP-005**: Per-environment frontend and backend origins, initially using each account's `workers.dev` hostnames or custom domains whose zones are available to the corresponding account.
- **DEP-006**: Stripe test-mode configuration for staging and live-mode configuration for production, including one webhook endpoint and signing secret per environment.
- **DEP-007**: One RealtimeKit application in each Cloudflare account.

## 5. Files

- **FILE-001**: `infrastructure/variables.tf` — add required `environment`; remove unused `realtime_app_id`.
- **FILE-002**: `infrastructure/main.tf` — replace environment collections with singular Neon and Hyperdrive resources; adopt split Worker identity/settings plus create-only bootstrap version/deployment resources.
- **FILE-003**: `infrastructure/outputs.tf` — expose singular environment outputs; remove collection and RealtimeKit outputs.
- **FILE-004**: `infrastructure/versions.tf` — require a Cloudflare provider version supporting Worker rate-limit bindings; in Phase 2, require a Terraform version supporting S3 lockfiles.
- **FILE-005**: `infrastructure/backend.tf` — commit the partial S3 backend declaration.
- **FILE-006**: `infrastructure/backend.tf.example` — remove after `infrastructure/backend.tf` becomes the committed backend declaration.
- **FILE-007**: `infrastructure/backend-r2.hcl.example` — document the non-secret R2 backend configuration and lockfile.
- **FILE-008**: `infrastructure/terraform.tfvars.example` — add `environment`; remove obsolete RealtimeKit input.
- **FILE-009**: `infrastructure/README.md` — document one-environment-per-state behavior and R2 backend bootstrap.
- **FILE-010**: `infrastructure/tfplan` — remove the tracked generated plan artifact.
- **FILE-011**: `.gitignore` — allow committed `infrastructure/backend.tf` while retaining ignores for generated backend configuration, state, and plan files.
- **FILE-012**: `.github/workflows/deploy-infrastructure.yml` — reusable `workflow_call` workflow with a required `environment` input, selected GitHub Environment, backend initialization, Terraform variable mapping, secret validation, and bounded readiness polling.
- **FILE-013**: `.github/workflows/deploy-applications.yml` — reusable `workflow_call` workflow with a required `environment` input, selected GitHub Environments, `migrate-db` naming, configuration rendering, and pre-deploy secret synchronization.
- **FILE-014**: `scripts/set-github-env-secrets.sh` — configure the complete staging or production infrastructure/backend secret inventory.
- **FILE-015**: `docs/infrastructure/backend.md` — document per-environment Cloudflare, Neon, Hyperdrive, database, and backend configuration.
- **FILE-016**: `docs/infrastructure/frontend.md` — document environment-specific frontend origins and backend URLs.
- **FILE-017**: `docs/system/system-design/ci-cd.md` — document GitHub Environments, secrets, deployment routing, feature branches from staging, merge-commit production promotion, and exceptional hotfix reconciliation.
- **FILE-018**: `.github/workflows/quality-gate.yml` — enforce that pull requests targeting `main` originate from `staging`.
- **FILE-019**: `plans/terraform-support.md` — this implementation plan.
- **FILE-020**: `infrastructure/workers/backend-api.js` — bootstrap the `SessionTimerWorkflow` export required for a fresh apply.
- **FILE-021**: `infrastructure/workers/notification-orchestrator.js` — bootstrap the feedback and recording-finalization Workflow exports required for a fresh apply.
- **FILE-022**: `apps/notification-orchestrator/wrangler.jsonc` — mirror Terraform-owned Queue retry settings and the scheduled trigger.
- **FILE-023**: `.github/workflows/deploy.yml` — the only push/manual orchestrator: `resolve-environment` guard, `infrastructure`, `applications`, and `post-deploy-settings-reconciliation` jobs.

`apps/backend-rest/wrangler.jsonc` already matches the application-facing backend bindings after bootstrap. `apps/frontend/wrangler.jsonc` requires no Phase 1 changes. All committed Wrangler configurations retain the existing account-scoped names because the environments use separate Cloudflare accounts.

## 6. Testing

- **TEST-001**: Run `terraform fmt -check -recursive` in `infrastructure/` and require success.
- **TEST-002**: Run `terraform init -backend=false` followed by `terraform validate` and require success without environment credentials.
- **TEST-003**: Initialize each environment's R2 backend and run `terraform plan` with its GitHub Environment inputs. Each plan must contain one Neon project, one Neon role, one Neon database, one Hyperdrive configuration, split Worker identity/settings with create-only bootstrap versions, and the expected Cloudflare resources for that account.
- **TEST-004**: Confirm the two backends store independent state and that a job authenticated for staging cannot read or modify production state. Start two operations against one environment and confirm the S3 lockfile prevents concurrent state mutation.
- **TEST-005**: For each deployed environment, create or exercise a database record, an R2 object, a Queue message, and the relevant Worker endpoint; confirm that the effects appear only in the selected Cloudflare account and Neon project.
- **TEST-006**: Confirm each frontend calls its matching backend and that Better Auth accepts only the configured environment origins.
- **TEST-007**: Confirm staging uses Stripe test-mode credentials and its staging webhook secret, while production uses live-mode credentials and its production webhook secret.
- **TEST-008**: Dispatch the orchestrator manually from its matching branch and environment and require success. Dispatch `staging` from `main` and `production` from `staging` and require rejection before credentials or Terraform are used.
- **TEST-009**: Merge an infrastructure change from a feature branch into staging, then promote staging to main; confirm each deployment targets the expected GitHub Environment, Cloudflare account, backend state, and Neon project.
- **TEST-010**: Promote an application change through the same feature branch → staging → main path and confirm migrations and all Worker deployments use the selected environment's secrets.
- **TEST-011**: Start deployments to two different environments and confirm they can proceed independently; start two deployments to one environment and confirm its concurrency group serializes them.
- **TEST-012**: Confirm production deployment starts only after a protected `staging` → `main` pull request is merged.
- **TEST-013**: Open a feature-branch pull request directly to `main` and require the promotion-policy check to fail; open a `staging` → `main` pull request and require it to pass. After merge, confirm the staging head commit is an ancestor of the resulting production merge commit.
- **TEST-014**: Confirm infrastructure readiness fails when the bounded polling window exhausts without `email_sending_enabled=true`, that applications do not start, and that the post-deploy settings-reconciliation apply reasserts Terraform-owned Worker identity settings after applications.

## 7. Risks & Assumptions

- **RISK-001**: A mismatched Cloudflare token and account ID can deploy resources to the wrong account. Secret validation and the branch/environment guard reduce but do not eliminate incorrect secret configuration.
- **RISK-002**: Incorrect R2 backend credentials or endpoint selection can initialize the wrong state. Per-environment state buckets and bucket-scoped credentials limit the blast radius.
- **RISK-003**: Recreating Neon or Hyperdrive invalidates `DATABASE_URL` or `HYPERDRIVE_ID`. The bootstrap handoff must update both GitHub Environment secrets after recreation.
- **RISK-004**: The approved destructive rebuild removes current database contents and may replace every Terraform-managed resource. The cutover must not begin until that loss is explicitly accepted.
- **RISK-005**: Incorrect Better Auth URLs, trusted origins, or frontend API origins can connect one environment to another or break authentication.
- **RISK-006**: Mixing Stripe test and live credentials can send test traffic to production billing. Stripe mode and webhook verification must be tested separately in every environment.
- **RISK-007**: Every change merged into `staging` is included in its next promotion to `main`. Merge only production-eligible work into staging or protect incomplete behavior behind an explicit feature flag.
- **RISK-008**: Custom Worker domains require compatible DNS zone/account ownership. Use per-account `workers.dev` origins until custom domains are deliberately provisioned.
- **RISK-009**: R2 state buckets are bootstrap resources outside the application Terraform state. Their creation, credentials, recovery, and deletion protections must be documented and managed operationally.
- **ASSUMPTION-001**: Staging and production use completely separate Cloudflare accounts rather than separate zones in one account.
- **ASSUMPTION-002**: Account-scoped Cloudflare resources, including R2 buckets, may use identical names in the two separate accounts.
- **ASSUMPTION-003**: The existing Terraform state, Cloudflare resources, and Neon data do not need to be preserved after the replacement environments are verified.
- **ASSUMPTION-004**: Both Neon projects may share one Neon organization because their names include the environment.
- **ASSUMPTION-005**: Environment-specific application URLs and provider accounts are available before application deployment.
- **ASSUMPTION-006**: Feature branches use local development and pull-request CI before merging into the shared staging environment; no permanent deployed development environment is required.

## 8. Related Specifications / Further Reading

- [Cloudflare: Remote R2 backend](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/)
- [Cloudflare: Create R2 buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/)
- [Cloudflare: R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [HashiCorp: S3 backend and state locking](https://developer.hashicorp.com/terraform/language/backend/s3)
- [GitHub: Managing environments for deployment](https://docs.github.com/actions/deployment/targeting-different-environments/managing-environments-for-deployment)
- [`docs/system/system-design/ci-cd.md`](../docs/system/system-design/ci-cd.md)
- [`docs/infrastructure/backend.md`](../docs/infrastructure/backend.md)
- [`docs/infrastructure/frontend.md`](../docs/infrastructure/frontend.md)
