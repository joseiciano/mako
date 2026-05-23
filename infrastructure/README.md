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
- Cloudflare R2 buckets for recordings and screenshots
- Cloudflare Hyperdrive configs for development and production Neon projects
- Cloudflare Workflow (`interview-lifecycle`) and workflow binding
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

- AI Gateway currently has no first-class Terraform resource in the Cloudflare provider. This setup exposes `AI_GATEWAY_BASE_URL` binding when `ai_gateway_name` is provided.
- Worker scripts under `./workers` are bootstrap placeholders to establish Terraform-managed worker resources. Application deployments can later replace script content via CI/Wrangler.
- `cloudflare_workers_script.notification_orchestrator` intentionally ignores script content/runtime binding drift so Wrangler remains the source of truth for that worker's deployed config.
- Migration note: this stack no longer provisions a Realtime app. If you previously managed `cloudflare_calls_sfu_app.realtime` in state and want to keep that app, run `terraform state rm cloudflare_calls_sfu_app.realtime` before `terraform apply`, then set `realtime_app_id` in your tfvars.
