output "worker_script_names" {
  description = "Provisioned Cloudflare Worker script names."
  value = {
    backend_api               = cloudflare_worker.backend_api.name
    greedy_matcher            = cloudflare_workers_script.greedy_matcher.script_name
    notification_orchestrator = cloudflare_worker.notification_orchestrator.name
  }
}

output "r2_bucket_names" {
  description = "Provisioned Cloudflare R2 bucket names."
  value = {
    recordings  = cloudflare_r2_bucket.recordings.name
    screenshots = cloudflare_r2_bucket.screenshots.name
  }
}

output "notification_orchestration_queue" {
  description = "Notification orchestration queue metadata."
  value = {
    queue_name = cloudflare_queue.notification_orchestration.queue_name
    queue_id   = cloudflare_queue.notification_orchestration.queue_id
  }
}

output "hyperdrive_id" {
  description = "Hyperdrive configuration ID for the selected environment."
  value       = cloudflare_hyperdrive_config.postgres.id
}

output "database_url" {
  description = "Direct SSL-required Neon connection URI for migrations in the selected environment."
  sensitive   = true
  value       = "postgresql://${urlencode(neon_role.app.name)}:${urlencode(neon_role.app.password)}@${neon_project.db.database_host}:5432/${urlencode(neon_database.app.name)}?sslmode=require&channel_binding=require"
}

output "neon_project_id" {
  description = "Neon project ID for the selected environment."
  value       = neon_project.db.id
}

output "neon_database_host" {
  description = "Direct Neon database host for the selected environment."
  value       = neon_project.db.database_host
}

output "ai_gateway_base_url" {
  description = "Computed AI Gateway base URL (empty when ai_gateway_name is not set)."
  value       = local.ai_gateway_base_url
}

output "email_sending_domain" {
  description = "Environment-specific Cloudflare Email Sending domain."
  value       = cloudflare_email_sending_subdomain.auth.name
}

output "auth_email_from" {
  description = "Derived sender address allowed by the backend EMAIL binding."
  value       = local.auth_email_from
}

output "email_sending_enabled" {
  description = "Whether Cloudflare reports the sending domain ready; this is domain readiness, not proof of message delivery."
  value       = cloudflare_email_sending_subdomain.auth.enabled
}

output "email_sending_dkim_selector" {
  description = "Cloudflare-managed DKIM selector for the sending domain."
  value       = cloudflare_email_sending_subdomain.auth.dkim_selector
}

output "email_sending_return_path_domain" {
  description = "Cloudflare-managed return-path domain used for bounce handling."
  value       = cloudflare_email_sending_subdomain.auth.return_path_domain
}
