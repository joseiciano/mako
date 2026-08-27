# Infrastructure (Terraform)

Terraform in this directory provisions Cloudflare and Neon resources required for Story 1.2.

## Provisioned Resources

- Cloudflare Workers scripts:
  - `mako-backend-rest` (main backend API worker)
  - `mako-greedy-matcher` (cron worker)
  - `mako-notification-orchestrator` (queue consumer worker)

- Cloudflare Workers Cron trigger for Greedy Matcher
- Cloudflare Queue: `notification-orchestration`
- Cloudflare Queue consumer for Notification Orchestrator worker
- Cloudflare R2 buckets for recordings and screenshots (with 30-day lifecycle rules)
- Cloudflare Hyperdrive configs for development and production Neon projects
- Cloudflare Workflows (`interview-lifecycle`, `feedback-workflow`, and `recording-finalization-workflow`) and workflow bindings (`RECORDING_FINALIZATION_WORKFLOW` bound to both `backend_api` for direct webhook handoff and `notification_orchestrator` for scheduled sweep recovery; every workflow binding object uses stable `var.*_workflow_name` and `var.notification_orchestrator_worker_script_name` literals to break Terraform workflow↔script dependency cycles, while the `cloudflare_workflow` resources themselves reference `cloudflare_workers_script.notification_orchestrator.script_name`)
- Cloudflare Realtime app credentials (externally managed) wired into worker bindings
- Neon Postgres development and production projects (plus app role/database)

## Quick Start

1. Copy the variables example file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

2. Fill `terraform.tfvars` with your Cloudflare and Neon credentials.

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

## Optional: Remote State on Cloudflare R2

Terraform backend blocks cannot be parameterized, so this repo ships templates:

1. Copy `backend.tf.example` to `backend.tf`.
2. Copy `backend-r2.hcl.example` to `backend-r2.hcl` and fill values.
3. Reinitialize Terraform backend:

```bash
terraform init -reconfigure -backend-config=backend-r2.hcl
```

## Notes

- AI Gateway has no first-class Terraform resource in the Cloudflare provider. When `ai_gateway_name` is set, Terraform exposes `AI_GATEWAY_BASE_URL` as a `plain_text` binding. The backend worker extracts the gateway ID from this URL at runtime and sends it via the `cf-aig-gateway-id` header on the Cloudflare REST `/accounts/{id}/ai/v1/chat/completions` endpoint for observability and routing. The responder intentionally disables cache for mutable interview context.
- `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL` is provisioned by Terraform on `cloudflare_workers_script.backend_api` as a non-secret `plain_text` binding with value `https://api.realtime.cloudflare.com/.well-known/webhooks.json`, mirroring `apps/backend-rest/wrangler.jsonc` `vars`. It is never modeled as a secret and is preserved across Wrangler deploys via `--keep-vars`.
- Worker scripts under `./workers` are bootstrap placeholders to establish Terraform-managed worker resources. Application deployments can later replace script content via CI/Wrangler.
- `cloudflare_workers_script.notification_orchestrator` intentionally ignores script content drift (`content_file`, `content_sha256`, `main_module`, `compatibility_date`) so Wrangler remains the source of truth for deployed script content. Bindings are Terraform-managed.
- Migration note: this stack no longer provisions a Realtime app. If you previously managed `cloudflare_calls_sfu_app.realtime` in state and want to keep that app, run `terraform state rm cloudflare_calls_sfu_app.realtime` before `terraform apply`, then set `realtime_app_id` in your tfvars.
- Workflow binding cycle break: `cloudflare_workers_script.notification_orchestrator` and `cloudflare_workers_script.backend_api` workflow bindings use stable variable/literal `workflow_name` and `script_name` values (`var.interview_workflow_name`, `var.feedback_workflow_name`, `var.recording_finalization_workflow_name`, `var.notification_orchestrator_worker_script_name`) and never reference `cloudflare_workflow.*.workflow_name` or `cloudflare_workers_script.notification_orchestrator.script_name` inside `notification_orchestrator.bindings`. This keeps `terraform graph` cycle-free; production Terraform variable defaults align with local `wrangler.jsonc` `workflows[].name`/`class_name` and `name` fields.
