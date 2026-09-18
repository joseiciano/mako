# Infrastructure (Terraform)

Terraform in this directory provisions Cloudflare and Neon resources required for Story 1.2.

## Environment Contract (Phase 1)

One Terraform invocation provisions exactly one complete environment, selected by the required `environment` variable (`staging` or `production`, no default so an omitted value cannot silently target production). Each environment has its own Cloudflare account, Neon project, and Terraform state; there is no `development` environment and no environment `for_each` in this stack.

Per invocation, Terraform creates exactly one of each:

- Neon project `${var.project_name}-${var.environment}` (e.g. `mako-staging`, `mako-production`), application role, and application database
- Cloudflare Hyperdrive configuration `${var.project_name}-${var.environment}-hyperdrive`, wired to that project's explicit role and database

Cloudflare resource names are account-scoped and therefore stable across environments: Workers, R2 buckets, Queues, Workflows, and the rate-limiter namespace ID are reused as-is in each separate Cloudflare account, with no environment suffixes. Neon project names are the exception: the Neon namespace is the organization, which may be shared by both environments, so the project name embeds the environment to keep the two projects distinct.

## Provisioned Resources

- Cloudflare Workers scripts:
  - `mako-backend-rest` (main backend API worker)
  - `mako-greedy-matcher` (cron worker)
  - `mako-notification-orchestrator` (queue consumer worker)
- Cloudflare Workers Cron triggers:
  - Greedy Matcher: `*/10 * * * *`
  - Notification Orchestrator: `*/5 * * * *`
- Cloudflare Queue: `notification-orchestration` (with dead-letter queue `notification-orchestration-dlq`)
- Cloudflare Queue consumer for Notification Orchestrator: batch size 10, max wait 5 seconds, retries 3, retry delay 30 seconds, dead-letter queue `notification-orchestration-dlq`
- Cloudflare R2 buckets for recordings and screenshots (with 30-day lifecycle rules)
- One Cloudflare Hyperdrive configuration for the environment's Neon project
- Cloudflare Workflows:
  - `session-timer-workflow` (class `SessionTimerWorkflow`, bootstrapped in `mako-backend-rest`)
  - `feedback-workflow` (class `InterviewFeedbackWorkflow`, bootstrapped in `mako-notification-orchestrator`)
  - `recording-finalization-workflow` (class `RecordingFinalizationWorkflow`, bootstrapped in `mako-notification-orchestrator`)
- Worker bindings:
  - `mako-backend-rest`: `HYPERDRIVE`, `RECORDINGS_BUCKET`, `SCREENSHOTS_BUCKET`, `NOTIFICATION_QUEUE`, `SESSION_TIMER_WORKFLOW`, `RECORDING_FINALIZATION_WORKFLOW` (direct webhook handoff), `PREMIUM_MARKETPLACE_RATE_LIMITER` (namespace `1001`, limit 60 per 60 seconds), and `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL`
  - `mako-notification-orchestrator`: `HYPERDRIVE`, `RECORDINGS_BUCKET`, `SCREENSHOTS_BUCKET`, `NOTIFICATION_QUEUE`, `FEEDBACK_WORKFLOW`, `RECORDING_FINALIZATION_WORKFLOW` (scheduled sweep recovery), and `AI`
- Neon: one project `${var.project_name}-${var.environment}`, plus its application role and database

Workflow binding cycle break: worker workflow bindings reference workflows by stable `var.*_workflow_name` literals instead of the `cloudflare_workflow` resources, breaking Terraform workflow↔script dependency cycles. Self-hosted bindings (workflows bootstrapped on the same script) set `class_name` and omit `script_name`; only the backend's external `RECORDING_FINALIZATION_WORKFLOW` binding also pins `script_name` to the stable `var.notification_orchestrator_worker_script_name` literal. The `cloudflare_workflow` resources themselves reference their bootstrap script (`cloudflare_workers_script.backend_api.script_name` for `session_timer`, `cloudflare_workers_script.notification_orchestrator.script_name` for `feedback` and `recording_finalization`).

## Quick Start

1. Copy the variables example file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

2. Fill `terraform.tfvars` with your Cloudflare and Neon credentials and set `environment` to `staging` or `production`.

3. Initialize and validate:

```bash
terraform init
terraform validate
```

4. Review and apply:

```bash
terraform plan
terraform apply
```

## Remote State on Cloudflare R2

The committed `backend.tf` activates a partial S3 backend. Each environment uses a separate `mako-terraform-state` bucket in its own Cloudflare account, so the staging credentials cannot access production state. Both buckets use the object key `mako/terraform.tfstate`; account-specific credentials and endpoints provide the isolation.

Bootstrap each bucket outside this Terraform stack:

1. In each Cloudflare account, create an R2 bucket named `mako-terraform-state`. Never add this bootstrap bucket to this stack, because Terraform cannot store its own state in a bucket before that bucket exists.
2. Create an R2 API token with **Object Read & Write** permission scoped only to that account's `mako-terraform-state` bucket. The lockfile requires read, write, and delete access to `mako/terraform.tfstate.tflock`; Terraform reads and writes `mako/terraform.tfstate`.
3. Save the token's Access Key ID and Secret Access Key in the operator credential manager and in the matching GitHub Environment as `TF_STATE_R2_ACCESS_KEY_ID` and `TF_STATE_R2_SECRET_ACCESS_KEY`. GitHub secrets cannot be read back later.
4. Do not configure an R2 bucket lock covering `mako/terraform.tfstate` or `mako/terraform.tfstate.tflock`; Terraform must overwrite state and create/delete its lockfile. R2 does not expose S3 bucket versioning, so independently stored encrypted `terraform state pull` snapshots are the recovery mechanism when required.

For operator use, copy `backend-r2.hcl.example` to the ignored `backend-r2.hcl` and replace `<cloudflare-account-id>` with the selected environment's concrete Cloudflare account ID. Keep credentials out of backend files and export them through the standard S3 environment variables:

```bash
export AWS_ACCESS_KEY_ID='<selected-environment-r2-access-key-id>'
export AWS_SECRET_ACCESS_KEY='<selected-environment-r2-secret-access-key>'
export AWS_REGION='auto'
terraform init -reconfigure -backend-config=backend-r2.hcl
```

Terraform backend configuration cannot reference Terraform variables. Always render the endpoint for the selected account before initialization, and never reuse one environment's bucket credentials for the other. CI renders the same non-secret settings into the ignored `backend.ci.hcl` while obtaining credentials from the selected GitHub Environment.

The backend uses Terraform's S3 lockfile (`use_lockfile = true`), which creates `mako/terraform.tfstate.tflock` during state mutations. Terraform 1.10.0 or newer is required; CI is pinned to Terraform 1.10.5.

[Cloudflare's remote backend guide](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/) documents the R2 S3 compatibility settings and bucket-scoped credentials. [HashiCorp's S3 backend reference](https://developer.hashicorp.com/terraform/language/backend/s3) documents partial configuration, credential environment variables, and lockfile permissions.

## Notes

- AI Gateway has no first-class Terraform resource in the Cloudflare provider. When `ai_gateway_name` is set, Terraform exposes `AI_GATEWAY_BASE_URL` as a `plain_text` binding. The backend worker extracts the gateway ID from this URL at runtime and sends it via the `cf-aig-gateway-id` header on the Cloudflare REST `/accounts/{id}/ai/v1/chat/completions` endpoint for observability and routing. The responder intentionally disables cache for mutable interview context.
- `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL` is provisioned by Terraform on `cloudflare_workers_script.backend_api` as a non-secret `plain_text` binding with value `https://api.realtime.cloudflare.com/.well-known/webhooks.json`, mirroring `apps/backend-rest/wrangler.jsonc` `vars`. It is never modeled as a secret and is preserved across Wrangler deploys via `--keep-vars`.
- Terraform owns persistent Cloudflare resources, Worker bindings, triggers, and the bootstrap scripts under `./workers`; Wrangler owns deployed application script content and runtime secrets. `cloudflare_workers_script.backend_api` and `cloudflare_workers_script.notification_orchestrator` intentionally ignore script content drift (`content_file`, `content_sha256`, `main_module`, `compatibility_date`) so Wrangler remains the source of truth for deployed script content, while bindings and triggers remain Terraform-managed. `mako-greedy-matcher` stays fully Terraform-owned because no Wrangler application deploys it.
- Committed Wrangler configuration must mirror Terraform-owned bindings and triggers exactly: a Wrangler deploy followed by `terraform plan` must produce no binding or trigger drift. The Terraform resource-name variables (Worker script names, R2 bucket names, Queue name, Workflow names, notification cron) remain supported, and their committed defaults already match that Wrangler configuration. Any override requires updating the corresponding committed Wrangler configuration in the same change; an arbitrary Terraform-only override violates the no-drift contract.
- RealtimeKit app credentials are managed outside Terraform. `CLOUDFLARE_REALTIMEKIT_APP_ID` is a GitHub Environment secret synchronized by Wrangler, not a Terraform input; this stack no longer provisions or references a Realtime app in Terraform.