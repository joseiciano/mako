# Infrastructure (Terraform)

Terraform in this directory provisions Cloudflare and Neon resources required for Story 1.2.

## Environment Contract (Phase 1)

One Terraform invocation provisions exactly one complete environment, selected by the required `environment` variable (`staging` or `production`, no default so an omitted value cannot silently target production). Each environment has its own Cloudflare account, Neon project, and Terraform state; there is no `development` environment and no environment `for_each` in this stack.

Per invocation, Terraform creates exactly one of each:

- Neon project `${var.project_name}-${var.environment}` (e.g. `mako-staging`, `mako-production`), application role, and application database
- Cloudflare Hyperdrive configuration `${var.project_name}-${var.environment}-hyperdrive`, wired to that project's explicit role and database

Cloudflare resource names are account-scoped and therefore stable across environments: Workers, R2 buckets, Queues, Workflows, and the rate-limiter namespace ID are reused as-is in each separate Cloudflare account, with no environment suffixes. Neon project names are the exception: the Neon namespace is the organization, which may be shared by both environments, so the project name embeds the environment to keep the two projects distinct.

## Email Service Contract

Each environment must supply its own non-secret `email_sending_zone_id` and `email_sending_domain`. The zone, sending domain, Terraform token, and Worker account must belong to that environment's Cloudflare account; staging values must never reference production resources or vice versa. Before apply, an operator must confirm that Cloudflare DNS is authoritative for the selected zone, the zone contains the sending domain, the account plan permits the intended recipients, and the Terraform deployment token has Email Sending edit access.

Terraform owns one `cloudflare_email_sending_subdomain.auth` per environment. Cloudflare Email Service owns the domain's MX, SPF, DKIM, DMARC, and return-path records; this stack intentionally creates no duplicate `cloudflare_dns_record` resources. Message previews and dropping suppressed recipients are both explicitly disabled (`preview_enabled = false`, `drop_suppressed_recipients = false`).

Only `mako-backend-rest` receives the native `EMAIL` binding and the derived non-secret `AUTH_EMAIL_FROM` value, `noreply@${var.email_sending_domain}`. The sender allowlist contains exactly that address. The frontend, greedy matcher, and notification orchestrator receive no email bindings.

After apply, inspect the non-sensitive outputs `email_sending_domain`, `auth_email_from`, `email_sending_enabled`, `email_sending_dkim_selector`, and `email_sending_return_path_domain`. `email_sending_enabled = true` proves Cloudflare reports the domain ready; it does not prove mailbox delivery. Operators must still verify the Cloudflare-managed DNS state and complete a controlled staging send before enabling verification behavior.

## Provisioned Resources

- Cloudflare Worker application identities and bootstrap versions (split `cloudflare_worker`, `cloudflare_worker_version`, `cloudflare_workers_deployment` model):
  - `mako-backend-rest` (main backend API worker; bootstrap module `infrastructure/workers/backend-api.js`, initial 100% deployment)
  - `mako-notification-orchestrator` (queue consumer worker; bootstrap module `infrastructure/workers/notification-orchestrator.js`, initial 100% deployment)
- Cloudflare Workers script for the cron worker:
  - `mako-greedy-matcher` (cron worker; fully Terraform-owned, no Wrangler deploys it)
- Cloudflare Workers Cron triggers:
  - Greedy Matcher: `*/10 * * * *`
  - Notification Orchestrator: `*/5 * * * *`
- Cloudflare Queue: `notification-orchestration` (with dead-letter queue `notification-orchestration-dlq`)
- Cloudflare Queue consumer for Notification Orchestrator: batch size 10, max wait 5 seconds, retries 3, retry delay 30 seconds, dead-letter queue `notification-orchestration-dlq`
- Cloudflare R2 buckets for recordings and screenshots (with 30-day lifecycle rules)
- One Cloudflare Hyperdrive configuration for the environment's Neon project
- One Cloudflare Email Sending domain for the environment, with Cloudflare-managed authentication and return-path DNS
- Cloudflare Workflows:
  - `session-timer-workflow` (class `SessionTimerWorkflow`, bootstrapped in `mako-backend-rest`)
  - `feedback-workflow` (class `InterviewFeedbackWorkflow`, bootstrapped in `mako-notification-orchestrator`)
  - `recording-finalization-workflow` (class `RecordingFinalizationWorkflow`, bootstrapped in `mako-notification-orchestrator`)
- Bootstrap version bindings:
  - `mako-backend-rest`: `HYPERDRIVE`, `RECORDINGS_BUCKET`, `SCREENSHOTS_BUCKET`, `NOTIFICATION_QUEUE`, `SESSION_TIMER_WORKFLOW`, `RECORDING_FINALIZATION_WORKFLOW` (direct webhook handoff), `PREMIUM_MARKETPLACE_RATE_LIMITER` (namespace `1001`, limit 60 per 60 seconds), `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL`, `EMAIL` (restricted to the derived sender), and `AUTH_EMAIL_FROM`
  - `mako-notification-orchestrator`: `HYPERDRIVE`, `RECORDINGS_BUCKET`, `SCREENSHOTS_BUCKET`, `NOTIFICATION_QUEUE`, `FEEDBACK_WORKFLOW`, `RECORDING_FINALIZATION_WORKFLOW` (scheduled sweep recovery), and `AI`; it has no email binding
- Neon: one project `${var.project_name}-${var.environment}`, plus its application role and database

## Worker Resource Graph and Deployment Ownership

The application Workers use the provider v5.25 split-resource model. For each of `mako-backend-rest` and `mako-notification-orchestrator`, Terraform creates a `cloudflare_worker` identity, a bootstrap `cloudflare_worker_version` containing the module from `infrastructure/workers/` (`application/javascript+module`) and the bindings below, and a `cloudflare_workers_deployment` that sends 100% of traffic to that bootstrap version. The exact creation graph is:

- R2 buckets, Queue, and Hyperdrive -> application `cloudflare_worker_version`
- Email Sending domain -> backend `cloudflare_worker_version`
- application `cloudflare_worker` -> application `cloudflare_worker_version` -> application `cloudflare_workers_deployment`
- backend bootstrap deployment -> `cloudflare_workflow.session_timer`
- notification-orchestrator bootstrap deployment -> `cloudflare_workflow.interview_feedback` and `cloudflare_workflow.recording_finalization`
- notification-orchestrator Worker identity -> its Cron trigger and Queue consumer

This ordering guarantees that a fresh environment has a deployed module exporting `SessionTimerWorkflow`, `InterviewFeedbackWorkflow`, and `RecordingFinalizationWorkflow` before Cloudflare is asked to create the corresponding Workflow resources. Bootstrap workflow bindings use stable workflow-name variables or literals rather than the `cloudflare_workflow` resources, so the graph has no workflow <-> version cycle. The backend's external `RECORDING_FINALIZATION_WORKFLOW` binding also uses the stable notification-orchestrator script-name variable rather than a resource reference.

Ownership changes after that first deployment:

- Terraform continuously owns each `cloudflare_worker` identity and its Worker-level observability settings. Backend query-string redaction is expressed only as `cloudflare_worker.backend_api.observability.redact_query_string = true`.
  Provider caveat: the pinned provider binary v5.25.0 (`terraform providers schema -json` confirms) accepts unknown keys inside `observability` without error but silently drops `redact_query_string` from state and from the API request, so on exactly that release Terraform does not enforce redaction. The attribute is forward-compatible: regenerate `.terraform.lock.hcl` against a newer 5.x release within `~> 5.25` (`terraform init -upgrade`, which is an operator action, not an automatic one) to get binary support. Until then, treat the dashboard/API check below as mandatory for redaction.
- Terraform retains its bootstrap `cloudflare_worker_version` as a create-time anchor, but ignores later changes to that version's modules, bindings, main module, and compatibility date. Terraform retains its initial `cloudflare_workers_deployment`, but ignores changes to its version allocation. A normal later apply therefore cannot move active traffic back to the bootstrap version.
- Wrangler is the sole owner of subsequent application versions and deployments, including the bindings and compatibility settings carried by each deployed application version. The committed Wrangler configuration must contain the complete application binding set.
- `mako-greedy-matcher` remains on `cloudflare_workers_script` and is fully Terraform-owned because no Wrangler application deploys it.

After every Wrangler deployment of the backend, verify in the Cloudflare dashboard (Workers & Pages -> `mako-backend-rest` -> Settings -> Observability -> Redact query strings) or through the Workers API that Worker-level observability remains enabled and **Redact query strings** remains enabled. Do not infer redaction from a successful deployment, from the Wrangler configuration, or from a passing `terraform validate`/`terraform plan`: on provider v5.25.0 Terraform silently drops `redact_query_string` (see the provider caveat above), so it is not enforced until the lockfile is upgraded. If it is disabled, stop log access and enable it in the dashboard or API, and upgrade the provider lockfile before treating request logs as safely redacted.

## Remote State on Cloudflare R2

The committed `backend.tf` activates a partial S3 backend. Each environment uses a separate `mako-terraform-state` bucket in its own Cloudflare account, so the staging credentials cannot access production state. Both buckets use the object key `mako/terraform.tfstate`; account-specific credentials and endpoints provide the isolation.

Bootstrap each bucket outside this Terraform stack before running `terraform init`:

1. In each Cloudflare account, create an R2 bucket named `mako-terraform-state`. Never add this bootstrap bucket to this stack, because Terraform cannot store its own state in a bucket before that bucket exists.
2. Create an R2 API token with **Object Read & Write** permission scoped only to that account's `mako-terraform-state` bucket. The lockfile requires read, write, and delete access to `mako/terraform.tfstate.tflock`; Terraform reads and writes `mako/terraform.tfstate`.
3. Save the token's Access Key ID and Secret Access Key in the operator credential manager and in the matching GitHub Environment as `TF_STATE_R2_ACCESS_KEY_ID` and `TF_STATE_R2_SECRET_ACCESS_KEY`. GitHub secrets cannot be read back later.
4. Do not configure an R2 bucket lock covering `mako/terraform.tfstate` or `mako/terraform.tfstate.tflock`; Terraform must overwrite state and create/delete its lockfile. R2 does not expose S3 bucket versioning, so independently stored encrypted `terraform state pull` snapshots are the recovery mechanism when required.

For operator use, copy `backend-r2.hcl.example` to the ignored `backend-r2.hcl` and replace `<cloudflare-account-id>` with the selected environment's concrete Cloudflare account ID. Keep credentials out of backend files and export them through the standard S3 environment variables:

```bash
cp backend-r2.hcl.example backend-r2.hcl
# Replace <cloudflare-account-id> in backend-r2.hcl before continuing.
export AWS_ACCESS_KEY_ID='<selected-environment-r2-access-key-id>'
export AWS_SECRET_ACCESS_KEY='<selected-environment-r2-secret-access-key>'
export AWS_REGION='auto'
```

Terraform backend configuration cannot reference Terraform variables. Always render the endpoint for the selected account before initialization, and never reuse one environment's bucket credentials for the other. CI renders the same non-secret settings into the ignored `backend.ci.hcl` while obtaining credentials from the selected GitHub Environment.

The backend uses Terraform's S3 lockfile (`use_lockfile = true`), which creates `mako/terraform.tfstate.tflock` during state mutations. Terraform 1.10.0 or newer is required; CI is pinned to Terraform 1.10.5.

[Cloudflare's remote backend guide](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/) documents the R2 S3 compatibility settings and bucket-scoped credentials. [HashiCorp's S3 backend reference](https://developer.hashicorp.com/terraform/language/backend/s3) documents partial configuration, credential environment variables, and lockfile permissions.

## Quick Start

1. Complete the R2 bucket, backend file, and credential export steps above. The backend must be usable before initialization.
2. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill it with the selected environment's Cloudflare and Neon credentials, account-local Email Sending zone/domain values, and `environment = "staging"` or `environment = "production"`.
3. Initialize and validate:

   ```bash
   terraform init -reconfigure -backend-config=backend-r2.hcl
   terraform validate
   ```

4. Review and apply:

   ```bash
   terraform plan
   terraform apply
   ```

5. In a fresh environment, let the apply finish through the bootstrap deployments and Workflow creation before running any application Worker Wrangler deployment. Wrangler owns application versions and active deployments only after this bootstrap completes.

## Existing Environment One-Time Cutover

The legacy `cloudflare_workers_script` state cannot be moved directly to the split resources: the resource types and state schemas are different. There is intentionally no `moved` block. Perform this procedure separately for every environment state, in a maintenance window, before applying this configuration.

1. Select the correct environment backend, acquire the state lock, and save an encrypted `terraform state pull` snapshot outside the repository.
2. Record the current Worker ID, live version ID, and active deployment ID for both application Workers. `npx wrangler versions list --name <script-name> --json` provides version IDs; `npx wrangler deployments list --name <script-name> --json` provides deployment IDs and their traffic allocations. For a gradual deployment, preserve the active deployment exactly and choose one of its referenced versions for the version import.
3. Remove only the two legacy state addresses. This does **not** delete the remote Workers:

   ```bash
   terraform state rm \
     'cloudflare_workers_script.backend_api' \
     'cloudflare_workers_script.notification_orchestrator'
   ```

4. Import the existing identities, one existing live version, and the current active deployment at the new addresses, substituting IDs recorded in step 2:

   ```bash
   terraform import cloudflare_worker.backend_api \
     '<account-id>/<backend-worker-id>'
   terraform import cloudflare_worker_version.backend_api \
     '<account-id>/<backend-worker-id>/<backend-version-id>'
   terraform import cloudflare_workers_deployment.backend_api \
     '<account-id>/<backend-script-name>/<backend-deployment-id>'

   terraform import cloudflare_worker.notification_orchestrator \
     '<account-id>/<notification-worker-id>'
   terraform import cloudflare_worker_version.notification_orchestrator \
     '<account-id>/<notification-worker-id>/<notification-version-id>'
   terraform import cloudflare_workers_deployment.notification_orchestrator \
     '<account-id>/<notification-script-name>/<notification-deployment-id>'
   ```

5. Review the first plan before applying. It must not create or replace either application Worker identity, version, or deployment, and it must not change active version percentages. Stop and restore the saved state snapshot if it does.

This cutover is not safely recreatable in place. If the legacy addresses are removed but the six imports are skipped, mistyped, or applied against the wrong environment, Terraform can attempt to create a bootstrap version and a new 100% bootstrap deployment; that would replace the live Wrangler application deployment. Imports themselves do not upload code or change traffic. Do not run `terraform apply` between state removal and completion of all imports. Loss, manual removal, tainting, or forced replacement of the split version/deployment state later also invalidates the no-rollback guarantee and requires the same live-resource import procedure before another apply.

## Notes

- AI Gateway has no first-class Terraform resource in the Cloudflare provider. When `ai_gateway_name` is set, the bootstrap backend version receives `AI_GATEWAY_BASE_URL` as a `plain_text` binding. The backend worker extracts the gateway ID from this URL at runtime and sends it via the `cf-aig-gateway-id` header on the Cloudflare REST `/accounts/{id}/ai/v1/chat/completions` endpoint for observability and routing. The responder intentionally disables cache for mutable interview context.
- `REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL` is a non-secret `plain_text` binding with value `https://api.realtime.cloudflare.com/.well-known/webhooks.json`. It exists in the Terraform bootstrap version and must remain mirrored in `apps/backend-rest/wrangler.jsonc`; it is never modeled as a secret.
- Terraform owns the application Worker identities, Worker-level observability, bootstrap anchors, Workflows, triggers, Queue consumer, and supporting resources. Wrangler owns every application version and deployment after bootstrap, plus runtime secrets. Wrangler deployment configuration must mirror the bootstrap binding contract and stable resource names; Terraform intentionally does not reconcile application-version binding drift after bootstrap.
- The Worker script-name, R2 bucket-name, Queue-name, Workflow-name, and notification-cron variables remain supported, and their defaults match the committed Wrangler configuration. Any override requires updating the corresponding Wrangler configuration in the same change.
- RealtimeKit app credentials are managed outside Terraform. `CLOUDFLARE_REALTIMEKIT_APP_ID` is a GitHub Environment secret synchronized by Wrangler, not a Terraform input; this stack no longer provisions or references a Realtime app in Terraform.