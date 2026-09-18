output "worker_script_names" {
  description = "Provisioned Cloudflare Worker script names."
  value = {
    backend_api               = cloudflare_workers_script.backend_api.script_name
    greedy_matcher            = cloudflare_workers_script.greedy_matcher.script_name
    notification_orchestrator = cloudflare_workers_script.notification_orchestrator.script_name
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
