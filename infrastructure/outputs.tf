output "worker_script_names" {
  description = "Provisioned Cloudflare Worker script names."
  value = {
    backend_api           = cloudflare_workers_script.backend_api.script_name
    greedy_matcher        = cloudflare_workers_script.greedy_matcher.script_name
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

output "hyperdrive_ids" {
  description = "Hyperdrive config IDs keyed by environment."
  value = {
    for env, cfg in cloudflare_hyperdrive_config.postgres : env => cfg.id
  }
}

output "neon_project_ids" {
  description = "Neon project IDs keyed by environment."
  value = {
    for env, project in neon_project.db : env => project.id
  }
}

output "neon_connection_uris" {
  description = "Neon direct and pooler connection strings keyed by environment."
  sensitive   = true
  value = {
    for env, project in neon_project.db : env => {
      direct = project.connection_uri
      pooler = project.connection_uri_pooler
    }
  }
}

output "realtime_binding" {
  description = "Cloudflare Realtime app identifier used in worker bindings."
  value = {
    app_id = var.realtime_app_id
  }
}

output "workflow_name" {
  description = "Provisioned Cloudflare Workflow name."
  value       = cloudflare_workflow.interview_lifecycle.workflow_name
}

output "ai_gateway_base_url" {
  description = "Computed AI Gateway base URL (empty when ai_gateway_name is not set)."
  value       = local.ai_gateway_base_url
}
