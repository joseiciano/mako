---
goal: Migrate cfemail infrastructure from Terraform to wrangler + a one-time bootstrap script
date_created: 2026-09-25
last_updated: 2026-09-27
status: 'In Progress'
tags: ['infrastructure', 'migration', 'cloudflare', 'wrangler', 'ci-cd']
---

# Introduction

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-yellow)

Replace the Terraform stack in `infrastructure/` with the pattern proven in
`~/Documents/workspace/classprints/assignment-reader`: every resource the
wrangler configs pin by ID or name is created by an idempotent one-time
`scripts/bootstrap.sh`, and all ongoing deploys are plain `wrangler deploy`
runs in CI. Terraform exists today mostly to create worker shells that wrangler
then overrides (hence the placeholder workers in `infrastructure/workers/`, the
`ignore_changes` blocks, and the "post-deploy settings reconciliation" second
apply in `deploy.yml`). Removing Terraform removes all of that machinery plus
the R2 remote-state backend and its credentials.

End state: `deploy.yml` = migrate-db + 4 wrangler deploys; resource creation =
manual bootstrap per environment; `infrastructure/` deleted.

## 1. Requirements & Constraints

- **REQ-001**: Terraform is fully removed. All Cloudflare and Neon resource creation moves to `scripts/bootstrap.sh` (one-time, per environment) and `wrangler deploy` (ongoing). No `.tf` files, no Terraform state backend, no `terraform` steps in CI remain at completion.
- **REQ-002**: `scripts/bootstrap.sh` is idempotent: running it against an already-provisioned environment detects existing resources and skips them without error, mirroring classprints' `scripts/bootstrap.sh` (CON-002 pattern: no auto-provisioning in CI).
- **REQ-003**: Resource identity is pinned in committed configs. Wrangler configs keep the `__HYPERDRIVE_ID__` placeholder injected from the `HYPERDRIVE_ID` GitHub secret; queues, buckets, and workflow names remain the stable literals already committed. The bootstrap prints IDs/next-steps but never writes into `apps/`.
- **REQ-004**: The 30-day R2 lifecycle rules on `mako-recordings` and `mako-screenshots` (delete at 2,592,000s, abort multipart uploads at 86,400s) are preserved. This is the canonical `interview-assets` contract in the repo AGENTS.md.
- **REQ-005**: The backend `EMAIL` send_email binding keeps `allowed_sender_addresses = ["noreply@<email_sending_domain>"]` and `AUTH_EMAIL_FROM = noreply@<email_sending_domain>` derived from the `EMAIL_SENDING_DOMAIN` GitHub variable.
- **REQ-006**: Runtime secrets continue to be synced via `wrangler secret put` in CI from GitHub Environment secrets; the bootstrap never handles secret values (SEC-004 pattern from classprints).
- **REQ-007**: The `mako-greedy-matcher` worker (`*/10 * * * *` cron, `HYPERDRIVE` binding) becomes a first-class wrangler app under `apps/` so it is no longer Terraform-only.
- **SEC-001**: The CI `CLOUDFLARE_API_TOKEN` remains one environment-scoped deploy token; the runtime token stays `CLOUDFLARE_RUNTIME_API_TOKEN` and is never exposed to the bootstrap path. The bootstrap requires a token with permissions for Workers, Queues, R2, Hyperdrive, Email Sending (zone), and Neon API access via `NEON_API_KEY`.
- **SEC-002**: After migration the `TF_STATE_R2_ACCESS_KEY_ID` / `TF_STATE_R2_SECRET_ACCESS_KEY` secrets are removed from both GitHub Environments and from the canonical secret inventory in `scripts/set-github-env-secrets.sh` and `scripts/set-github-env-secrets-from-env.sh` (repo rule: both scripts updated together).
- **CON-001**: staging and production are separate Cloudflare accounts and separate Neon projects. Resource names are account-scoped and stay identical across environments (no suffixes); Neon project names keep the `-staging`/`-production` suffix.
- **CON-002**: Cutover is adoption, not recreation. First `wrangler deploy` per worker targets the same script name and adopts the live worker. `terraform destroy` is forbidden before cutover is verified (RISK-005).
- **CON-003**: Deployment ordering stays: migrate-db → notification-orchestrator → backend-rest → frontend, with the existing concurrency groups preserved.
- **GUD-001**: Follow the repo AGENTS.md commit rules: small focused commits, one per phase slice; never push without approval.
- **PAT-001**: Follow classprints `assignment-reader/scripts/bootstrap.sh` structure: `set -eu`, env arg case-statement, required-env assertions with `: "${VAR:?}"`, per-resource loop with `wrangler ... describe || create` idempotency, summary heredoc of pasted IDs and remaining manual steps.
- **PAT-002**: Keep placeholder-rending CI steps (node script replacing `__HYPERDRIVE_ID__`) as-is; they already follow the "committed config + injected env-specific ID" contract.

## 2. Implementation Steps

### Implementation Phase 1: Bootstrap script

- GOAL-001: `scripts/bootstrap.sh` can take a fresh staging or production account from empty to "all pinned resources exist", printing every ID the wrangler configs and GitHub secrets need.

- [ ] **TASK-001**: Create `scripts/bootstrap.sh` modeled on classprints' `assignment-reader/scripts/bootstrap.sh`. Skeleton: `#!/bin/sh`, `set -eu`, environment arg case (`staging|production`, empty → usage error), assert `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEON_API_KEY`, `NEON_ORG_ID`, `EMAIL_SENDING_ZONE_ID`, `EMAIL_SENDING_DOMAIN` with `: "${VAR:?}"`, check `command -v wrangler` and `command -v neonctl`, never echo secret values.
- [ ] **TASK-002**: Neon section via `neonctl`: create project `mako-$ENVIRONMENT` (`neonctl projects create --name mako-$ENVIRONMENT --org <NEON_ORG_ID> --pg 17` or equivalent per pinned neonctl version), role `mako_app`, database `mako`; skip each when it already exists (list before create). Role password: for a *new* environment, reset the `mako_app` role password via neonctl (`neonctl roles set-password` or create-time password output) to obtain the credential for the direct connection string (`DATABASE_URL`) — Terraform sourced it from `neon_role.app.password`, neonctl may not expose it on create. Skip the reset on already-provisioned environments (GitHub secrets carry over; resetting would invalidate the live `DATABASE_URL`). Emit the direct `DATABASE_URL` value only as a prompt to paste into GitHub secrets — print to stdout for the operator, never store in the repo. (Update 2026-09-25: implemented; the bootstrap resets the password only for a fresh project or role and prints one `DATABASE_URL`.)
- [ ] **TASK-003**: Hyperdrive section: `wrangler hyperdrive create mako-$ENVIRONMENT-hyperdrive --connection-string="$DATABASE_URL"` (Terraform names it `${project_name}-${environment}-hyperdrive`, e.g. `mako-staging-hyperdrive`; using that exact name keeps `wrangler hyperdrive list` detection idempotent against an already-provisioned environment instead of creating a duplicate config) with `--caching-max-age=60 --caching-stale-while-revalidate=15` flags (or equivalent config flags for the pinned wrangler version) and `--origin-connection-limit=20`. Detection-first: `wrangler hyperdrive list` runs before the connection-string requirement — an existing config is skipped without needing `DATABASE_URL` (classprints pattern); the string is only required when creating. The direct Neon host is the Hyperdrive origin — the same URI as `DATABASE_URL` — because the live Terraform config used the direct host and Hyperdrive provides its own pooling; no separate pooled-URI variable exists. Print the resulting ID as the value to set as the `HYPERDRIVE_ID` GitHub secret. (Update 2026-09-25: implemented; bootstrap uses `DATABASE_URL` with `--max-age 60 --swr 15 --origin-connection-limit 20`.)
- [ ] **TASK-004**: Queues section: loop-create `notification-orchestration` and `notification-orchestration-dlq` via `wrangler queues create`, detecting existing via `wrangler queues list` (classprints loop pattern).
- [ ] **TASK-005**: R2 section: create `mako-recordings` and `mako-screenshots` via `wrangler r2 bucket create --location enam` (detect via `wrangler r2 bucket list` — location is create-only, irrelevant to already-provisioned buckets, but fresh environments must match Terraform's `r2_location = "enam"` to avoid silent location drift), then apply the 30-day lifecycle rules (REQ-004). Verify whether the pinned wrangler version supports lifecycle rules on `wrangler r2 bucket`; if not, apply via one `curl` to the R2 lifecycle API endpoint (`PUT /accounts/{account_id}/r2/buckets/{bucket}/lifecycle`) with the exact rule JSON from `infrastructure/main.tf:68-116`, and re-apply (idempotent overwrite) on every bootstrap run.
- [ ] **TASK-006**: Email Sending section: list existing sending domains first and skip creation when `EMAIL_SENDING_DOMAIN` already exists (a plain create on an already-provisioned environment returns a conflict — REQ-002), otherwise create the `cloudflare_email_sending_subdomain` equivalent via the Cloudflare Email Service API for `EMAIL_SENDING_DOMAIN` within `EMAIL_SENDING_ZONE_ID`, with `preview_enabled: false` and `drop_suppressed_recipients: false` (mirror `infrastructure/main.tf:6-11`; consult the cloudflare-email-service docs for the current endpoint before implementing). Run the readiness poll loop from `.github/workflows/deploy-infrastructure.yml:91-116` (12 attempts, 10s apart, poll the domain-enabled status) on every run, create or skip — existing environments still need readiness confirmed.
- [ ] **TASK-007**: Summary heredoc (classprints TASK-107 pattern): print all created/skipped resources and the exact post-bootstrap manual steps — set `HYPERDRIVE_ID`, `DATABASE_URL`, and (new account only) the remaining GitHub Environment secrets via `make envs`, plus `pnpm db:migrate` before first deploy.
- [ ] **TASK-008**: Test bootstrap idempotency against staging (TEST-001): run twice; second run must create nothing and exit 0.

### Implementation Phase 2: Wrangler config completion

- GOAL-002: Every worker is deployable by wrangler alone, with no binding that only Terraform could set.

- [ ] **TASK-009**: Create `apps/greedy-matcher/` (package.json matching the other apps' shape, tsconfig, `wrangler.jsonc`) with: `name: "mako-greedy-matcher"`, `main: "src/index.ts"`, `compatibility_date: "2026-03-15"`, `hyperdrive` binding `HYPERDRIVE` with `__HYPERDRIVE_ID__` placeholder, `triggers.crons: ["*/10 * * * *"]`, `observability` enabled. Move `infrastructure/workers/greedy-matcher.js` to `apps/greedy-matcher/src/index.ts` verbatim (preserve the contract-safety comment block). Register the app in the pnpm workspace if needed and wire its CI deploy step in Phase 3.
- [ ] **TASK-010**: Do NOT add `AI_GATEWAY_BASE_URL` to `apps/backend-rest/wrangler.jsonc`. The responder treats its absence as a supported mode (`ai-gateway-responder.ts:56-66` falls back to the plain `/ai/run/` endpoint), and no environment currently configures a gateway (`ai_gateway_name = ""` in `terraform.tfvars.example:37`, zero GitHub environment variables). Guard: before the staging cutover deploy (TASK-019), read the live worker's current vars via the Workers API (`GET /accounts/{id}/workers/scripts/{script}/settings`) and confirm `AI_GATEWAY_BASE_URL` is not bound. If it IS bound (gateway in use despite repo defaults), instead commit the literal gateway URL into `wrangler.jsonc` vars and skip the omission. Either way it is a static committed value, never a CI-rendered placeholder. This decision removes the `--keep-vars` dependency unconditionally.
- [ ] **TASK-011**: In `.github/workflows/deploy-applications.yml` backend job: drop `--keep-vars` from the deploy command unconditionally (TASK-010 resolves the only Terraform-owned plain-text var).
- [ ] **TASK-012**: Investigate `redact_query_string` support in the pinned wrangler version (it was unsupported at 4.73.0, the lockfile-resolved version across all apps). If supported, add it to `apps/backend-rest/wrangler.jsonc` observability and skip the CI patch step. If not, create `scripts/ensure-redact-query-string.sh` (curl PATCH of the worker's observability settings via the Workers API) and call it as a post-deploy step in the backend deploy job (RISK-001/RISK-002). Do not silently drop the setting.

### Implementation Phase 3: CI pipeline rewrite

- GOAL-003: `deploy.yml` on push/dispatch runs migrate-db + wrangler deploys only; all Terraform jobs, the R2 state backend, and the reconciliation job are gone.

- [ ] **TASK-013**: Rewrite `.github/workflows/deploy.yml`: keep `resolve-environment`; delete the `infrastructure` job and the `post-deploy-settings-reconciliation` job; keep the `applications` job depending only on `resolve-environment`; remove `infrastructure/**` and the `.github/workflows/deploy-infrastructure.yml` entry from the trigger `paths` (both lines exist today, `deploy.yml:11` and `deploy.yml:15`).
- [ ] **TASK-014**: Delete `.github/workflows/deploy-infrastructure.yml` and `infrastructure/backend-r2.hcl.example`, `infrastructure/.terraform.lock.hcl` together with the directory in TASK-024 (there is no committed `infrastructure/backend-r2.hcl`; only the `.example` exists — the real file is git-ignored and may exist locally for operators).
- [ ] **TASK-015**: In `.github/workflows/deploy-applications.yml`: remove the "Validate deployment inputs and secrets" steps that check `NEON_*` and Terraform-only secrets (bootstrap owns those now); keep migrate-db, the Hyperdrive placeholder injection, the secret-sync steps, and the three existing deploy jobs; add a `deploy-greedy-matcher` job (same shape as notification-orchestrator: checkout, pnpm, placeholder injection, `wrangler deploy`, no secrets to sync) with concurrency group `deploy-greedy-matcher-${{ inputs.environment }}`, needing only migrate-db.
- [ ] **TASK-016**: Update both `scripts/set-github-env-secrets.sh` (menu + inventory) and `scripts/set-github-env-secrets-from-env.sh` (`KNOWN_SECRETS` array): remove `TF_STATE_R2_ACCESS_KEY_ID` and `TF_STATE_R2_SECRET_ACCESS_KEY` (SEC-002). Keep `NEON_API_KEY`/`NEON_ORG_ID` (bootstrap) and `HYPERDRIVE_ID`, `DATABASE_URL` (CI placeholder injection + migrate).
- [ ] **TASK-017**: Update `.github/workflows/deploy.yml` environment-variable validation if any step referenced removed secrets; confirm `EMAIL_SENDING_ZONE_ID` / `EMAIL_SENDING_DOMAIN` remain as GitHub *variables* (bootstrap inputs, no longer Terraform vars).
- [ ] **TASK-018**: Validate the new pipeline with `gh workflow run deploy.yml --ref staging -f environment=staging` (TEST-002) after Phase 4's staging bootstrap.

### Implementation Phase 4: Staging cutover

- GOAL-004: Staging is fully served by bootstrap + wrangler; Terraform has made no writes to staging since this phase starts.

- [ ] **TASK-019**: Run `scripts/bootstrap.sh staging` against the staging account with real env values. Confirm: both queues exist, both buckets exist with lifecycle rules, Hyperdrive ID matches the `HYPERDRIVE_ID` secret, email sending domain reports enabled.
- [ ] **TASK-020**: Run the full staging pipeline (TEST-002). Then verify on staging: all 4 workers show recent deployments with the expected bindings (`wrangler deployments list --name <script> --json` + `wrangler versions list`), the orchestrator cron and queue consumer survive, workflows `session-timer-workflow`, `feedback-workflow`, `recording-finalization-workflow` exist and accept triggers, and `redact_query_string` is enabled per the dashboard/API check mandated in `infrastructure/README.md:71`.
- [ ] **TASK-021**: Staging smoke: exercise the backend health/metadata path and one authenticated flow; confirm `HYPERDRIVE` queries succeed (the bindings carry the same IDs as before, so this is adoption not recreation) and one email send succeeds (TEST-004).
- [ ] **TASK-022**: Only after TASK-021 passes: final `terraform apply` against staging state to confirm zero changes (adoption left nothing for Terraform to do), then stop using Terraform for staging entirely.

### Implementation Phase 5: Production cutover & Terraform decommission

- GOAL-005: Production runs on the new pipeline; Terraform is deleted from the repo and its state buckets retired.

- [ ] **TASK-023**: Repeat TASK-019 through TASK-022 for production (bootstrap with production values, dispatch pipeline from `main`, verify bindings/crons/workflows/redaction, smoke test). Production first deploy requires `CLOUDFLARE_REALTIMEKIT_APP_ID` present per existing validation.
- [ ] **TASK-024**: Delete `infrastructure/` from the repo (main.tf, variables.tf, outputs.tf, versions.tf, providers.tf, backend.tf, backend-r2.hcl*, terraform.tfvars.example, README.md, `.terraform*`, `workers/`). The bootstrap script + this plan supersede `infrastructure/README.md`.
- [ ] **TASK-025**: Update docs: `docs/system/system-design/ci-cd.md` (new pipeline: bootstrap → migrate → wrangler deploys), `docs/infrastructure/backend.md` (bootstrap + wrangler ownership replaces the Terraform resource graph), and remove the terraform-support plan link if referenced. Document the frozen-state note: state snapshots live in the per-account `mako-terraform-state` R2 buckets, which are retired manually (delete bucket + `TF_STATE_R2_*` R2 tokens) after a two-week soak period.
- [ ] **TASK-026**: Remove `TF_STATE_R2_*` secrets from both GitHub Environments (`gh secret delete`), and retire the R2 state tokens in the Cloudflare dashboards after the soak period (SEC-002 completion).

## 3. Alternatives

- **ALT-001**: Keep Terraform only for Neon and Email Sending, wrangler for the rest. Rejected: splits ownership across two systems with different state models — the exact drift problem the current reconciliation job exists to paper over; `neonctl` and the Email Service API cover both gaps with ~40 lines of bootstrap.
- **ALT-002**: Adopt Cloudflare's Terraform story (next-gen provider / Cloudflare-managed state). Rejected: still carries state, plan/apply, and the credentials for it; the classprints pattern proves this repo needs only declarative configs plus a one-time runbook.
- **ALT-003**: Bootstrap in TypeScript (wrangler programmatic API) instead of POSIX sh. Rejected: classprints' sh runbook is copy-paste auditable, runs anywhere wrangler runs, and matches PAT-001.
- **ALT-004**: Create workflows/crons via API in the bootstrap. Rejected: unnecessary — wrangler creates Workflow resources and cron triggers from the committed config at deploy time; bootstrap only needs what wrangler cannot create (Neon, Hyperdrive origin, lifecycle rules, Email Sending subdomain, queues when they precede first deploy).

## 4. Dependencies

- **DEP-001**: `wrangler` (pinned version across all apps; verify 4.x lifecycle-rule and hyperdrive flag support per TASK-005/TASK-012/TASK-003).
- **DEP-002**: `neonctl` CLI available in the operator and CI toolchain for TASK-002 (pin a version; Neon API key from `NEON_API_KEY`).
- **DEP-003**: Cloudflare Email Service REST API for the sending-subdomain creation + readiness poll (TASK-006); endpoint surface must be confirmed against current Cloudflare docs at implementation time.
- **DEP-004**: Existing GitHub Environment secrets/vars (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HYPERDRIVE_ID`, `DATABASE_URL`, `EMAIL_SENDING_ZONE_ID`, `EMAIL_SENDING_DOMAIN`, plus the app-runtime secrets) carry over unchanged; no new secrets or variables are introduced (TASK-010 drops the optional `AI_GATEWAY_BASE_URL` unless the live-vars guard finds it bound).
- **DEP-005**: The reference implementation `~/Documents/workspace/classprints/assignment-reader/scripts/bootstrap.sh` (structure to mirror, PAT-001).

## 5. Files

- **FILE-001**: `scripts/bootstrap.sh` — new, one-time per-env resource runbook (Phase 1).
- **FILE-002**: `apps/greedy-matcher/` — new wrangler app: `wrangler.jsonc`, `package.json`, `tsconfig.json`, `src/index.ts` (moved from `infrastructure/workers/greedy-matcher.js`).
- **FILE-003**: `apps/backend-rest/wrangler.jsonc` — add `AI_GATEWAY_BASE_URL` var, possibly `redact_query_string`, drop placeholder-comment.
- **FILE-004**: `.github/workflows/deploy.yml` — remove infrastructure + reconciliation jobs.
- **FILE-005**: `.github/workflows/deploy-infrastructure.yml` — deleted (TASK-014).
- **FILE-006**: `.github/workflows/deploy-applications.yml` — trim Terraform-era validation, drop `--keep-vars`, add greedy-matcher deploy job.
- **FILE-007**: `scripts/set-github-env-secrets.sh` and `scripts/set-github-env-secrets-from-env.sh` — remove `TF_STATE_R2_*` from both inventories (SEC-002).
- **FILE-008**: `scripts/ensure-redact-query-string.sh` — new, only if wrangler still lacks `redact_query_string` (TASK-012).
- **FILE-009**: `infrastructure/` — deleted in Phase 5 (TASK-024).
- **FILE-010**: `docs/system/system-design/ci-cd.md`, `docs/infrastructure/backend.md` — rewritten for the new pipeline (TASK-025).

## 6. Testing

- **TEST-001**: Bootstrap idempotency: run `scripts/bootstrap.sh staging` twice against staging; the second run must skip every resource and exit 0 with no duplicate creation.
- **TEST-002**: End-to-end pipeline: `gh workflow run deploy.yml --ref staging -f environment=staging` completes migrate-db + all four deploys green with no Terraform steps.
- **TEST-003**: Binding/version verification: `wrangler versions list --name mako-backend-rest --json` (and the other three workers) shows the deployed version carrying `HYPERDRIVE`, `RECORDINGS_BUCKET`, `SCREENSHOTS_BUCKET`, `NOTIFICATION_QUEUE`, workflow bindings, `EMAIL` allowlist, and `PREMIUM_MARKETPLACE_RATE_LIMITER`; orchestrator cron `*/5 * * * *` and consumer settings (batch 10, timeout 5, retries 3, delay 30, DLQ) visible via `wrangler` inspection; matcher cron `*/10 * * * *` per its config.
- **TEST-004**: Staging smoke: backend serves a request with a successful Hyperdrive query; one real email send from the `EMAIL` binding succeeds; R2 upload/expiry contract spot-checked against lifecycle rules.
- **TEST-005**: Redaction check: per `infrastructure/README.md:71`, confirm `mako-backend-rest` Worker-level observability has Redact query strings enabled after the first post-migration deploy (dashboard or Workers API).
- **TEST-006**: Placeholder hygiene: `grep -r "__HYPERDRIVE_ID__" apps/` still matches committed configs only; CI injection steps throw on missing `HYPERDRIVE_ID` (existing behavior preserved).

## 7. Risks & Assumptions

- **RISK-001**: Wrangler does not expose `redact_query_string` (confirmed unsupported at 4.73.0). Mitigation: TASK-012 decides between config support and the CI API-patch script; the README's mandatory dashboard check (TEST-005) stays until then.
- **RISK-002**: A wrangler deploy may reset Worker-level settings (the reason the current reconciliation job exists). Mitigation: if TASK-012 lands on the patch script, run it after every backend deploy and keep TEST-005 in the verification checklist.
- **RISK-003**: The Email Sending subdomain API surface may differ from what Terraform's provider used; bootstrap must verify domain readiness via the poll loop, not assume create-implies-ready.
- **RISK-004**: `neonctl` project/role/database flags differ across versions; pin the version in `package.json`/docs and verify against TASK-002 before the staging run.
- **RISK-005**: First `wrangler deploy` per worker uploads application code for workers whose current live code came from `infrastructure/workers/` stubs — for backend-rest and notification-orchestrator the live code is already wrangler-deployed, so stubs only matter for a *fresh* account bootstrap, where deploying the real app is the correct outcome.
- **RISK-006**: On already-provisioned environments, resetting the Neon `mako_app` role password during bootstrap would silently invalidate the live `DATABASE_URL` (Hyperdrive resolves credentials at create time; the same direct URI is both the migration and Hyperdrive origin input). Mitigation: TASK-002 — reset only on project/role creation; already-provisioned environments skip the password path entirely.
- **ASSUMPTION-001**: Worker script names, queue names, bucket names, and workflow names remain exactly as committed in the wrangler configs (Terraform variables' defaults); no rename during migration.
- **ASSUMPTION-002**: Both environments already have all Terraform-provisioned resources live; the bootstrap's job per environment is primarily idempotent-verification plus the two gaps (lifecycle rules, Email Sending domain) and Neon/Hyperdrive for any *new* environment.
- **ASSUMPTION-003**: The current one-token CI model (deploy token ≠ runtime token) is kept; no token redesign in this migration.

## 8. Related Specifications / Further Reading

- `plans/terraform-support.md` — the plan that introduced the current Terraform setup; historical context for the split-resource model and reconciliation job.
- `infrastructure/README.md` — the authoritative pre-migration contract (resource graph, email contract, redaction caveat); deleted with the directory but its invariants are carried into REQ-004/REQ-005 and TEST-005.
- `~/Documents/workspace/classprints/assignment-reader/scripts/bootstrap.sh` — reference bootstrap implementation (PAT-001).
- `docs/system/system-design/ci-cd.md` — Git/PR process and deployment docs to update in TASK-025.
- Cloudflare docs: [Hyperdrive](https://developers.cloudflare.com/hyperdrive/), [Queues](https://developers.cloudflare.com/queues/), [R2 lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), [Email Service](https://developers.cloudflare.com/email-service/), [Workflows](https://developers.cloudflare.com/workflows/).
