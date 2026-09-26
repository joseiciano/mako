locals {
  ai_gateway_base_url = var.ai_gateway_name != "" ? "https://gateway.ai.cloudflare.com/v1/${var.cloudflare_account_id}/${var.ai_gateway_name}" : ""
  auth_email_from     = "noreply@${var.email_sending_domain}"
}

resource "cloudflare_email_sending_subdomain" "auth" {
  zone_id                    = var.email_sending_zone_id
  name                       = var.email_sending_domain
  preview_enabled            = false
  drop_suppressed_recipients = false
}

resource "neon_project" "db" {
  name                      = "${var.project_name}-${var.environment}"
  org_id                    = var.neon_org_id != "" ? var.neon_org_id : null
  region_id                 = var.neon_region_id
  pg_version                = var.neon_pg_version
  history_retention_seconds = 21600
  store_password            = "yes"
}

resource "neon_role" "app" {
  project_id = neon_project.db.id
  branch_id  = neon_project.db.default_branch_id
  name       = var.neon_app_role_name
}

resource "neon_database" "app" {
  project_id = neon_project.db.id
  branch_id  = neon_project.db.default_branch_id
  name       = var.neon_database_name
  owner_name = neon_role.app.name
}

resource "cloudflare_hyperdrive_config" "postgres" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-${var.environment}-hyperdrive"

  origin = {
    scheme   = "postgresql"
    host     = neon_project.db.database_host
    port     = 5432
    database = neon_database.app.name
    user     = neon_role.app.name
    password = neon_role.app.password
  }

  caching = {
    max_age                = var.hyperdrive_cache_max_age_seconds
    stale_while_revalidate = var.hyperdrive_cache_stale_seconds
  }

  origin_connection_limit = var.hyperdrive_connection_limit
}

resource "cloudflare_r2_bucket" "recordings" {
  account_id = var.cloudflare_account_id
  name       = var.recordings_bucket_name
  location   = var.r2_location
}

resource "cloudflare_r2_bucket" "screenshots" {
  account_id = var.cloudflare_account_id
  name       = var.screenshots_bucket_name
  location   = var.r2_location
}

resource "cloudflare_r2_bucket_lifecycle" "recordings_retention" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.recordings.name

  rules = [{
    id      = "30-day-raw-artifact-retention"
    enabled = true
    conditions = {
      prefix = ""
    }
    abort_multipart_uploads_transition = {
      condition = {
        max_age = 86400
        type    = "Age"
      }
    }
    delete_objects_transition = {
      condition = {
        max_age = 2592000
        type    = "Age"
      }
    }
  }]
}

resource "cloudflare_r2_bucket_lifecycle" "screenshots_retention" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.screenshots.name

  rules = [{
    id      = "30-day-raw-artifact-retention"
    enabled = true
    conditions = {
      prefix = ""
    }
    abort_multipart_uploads_transition = {
      condition = {
        max_age = 86400
        type    = "Age"
      }
    }
    delete_objects_transition = {
      condition = {
        max_age = 2592000
        type    = "Age"
      }
    }
  }]
}

resource "cloudflare_queue" "notification_orchestration" {
  account_id = var.cloudflare_account_id
  queue_name = var.notification_orchestration_queue_name
}

resource "cloudflare_queue" "notification_orchestration_dlq" {
  account_id = var.cloudflare_account_id
  queue_name = "notification-orchestration-dlq"
}

resource "cloudflare_worker" "notification_orchestrator" {
  account_id = var.cloudflare_account_id
  name       = var.notification_orchestrator_worker_script_name

  observability = {
    enabled = true

    logs = {
      enabled         = true
      invocation_logs = true
    }
  }
}

resource "cloudflare_worker_version" "notification_orchestrator" {
  account_id         = var.cloudflare_account_id
  worker_id          = cloudflare_worker.notification_orchestrator.id
  compatibility_date = var.workers_compatibility_date
  main_module        = "notification-orchestrator.js"

  modules = [{
    name         = "notification-orchestrator.js"
    content_file = "${path.module}/workers/notification-orchestrator.js"
    content_type = "application/javascript+module"
  }]

  bindings = [
    {
      type        = "r2_bucket"
      name        = "RECORDINGS_BUCKET"
      bucket_name = cloudflare_r2_bucket.recordings.name
    },
    {
      type        = "r2_bucket"
      name        = "SCREENSHOTS_BUCKET"
      bucket_name = cloudflare_r2_bucket.screenshots.name
    },
    {
      type       = "queue"
      name       = "NOTIFICATION_QUEUE"
      queue_name = cloudflare_queue.notification_orchestration.queue_name
    },
    {
      type = "hyperdrive"
      name = "HYPERDRIVE"
      id   = cloudflare_hyperdrive_config.postgres.id
    },
    {
      type          = "workflow"
      name          = "FEEDBACK_WORKFLOW"
      workflow_name = var.feedback_workflow_name
      class_name    = var.feedback_workflow_class_name
    },
    {
      type          = "workflow"
      name          = "RECORDING_FINALIZATION_WORKFLOW"
      workflow_name = var.recording_finalization_workflow_name
      class_name    = var.recording_finalization_workflow_class_name
    },
    {
      type = "ai"
      name = "AI"
    }
  ]

  lifecycle {
    ignore_changes = [
      bindings,
      compatibility_date,
      main_module,
      modules,
    ]
  }
}

resource "cloudflare_workers_deployment" "notification_orchestrator" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_worker.notification_orchestrator.name
  strategy    = "percentage"

  versions = [{
    version_id = cloudflare_worker_version.notification_orchestrator.id
    percentage = 100
  }]

  lifecycle {
    ignore_changes = [versions]
  }
}

resource "cloudflare_workflow" "interview_feedback" {
  account_id    = var.cloudflare_account_id
  workflow_name = var.feedback_workflow_name
  script_name   = cloudflare_worker.notification_orchestrator.name
  class_name    = var.feedback_workflow_class_name

  depends_on = [cloudflare_workers_deployment.notification_orchestrator]
}

resource "cloudflare_workflow" "recording_finalization" {
  account_id    = var.cloudflare_account_id
  workflow_name = var.recording_finalization_workflow_name
  script_name   = cloudflare_worker.notification_orchestrator.name
  class_name    = var.recording_finalization_workflow_class_name

  depends_on = [cloudflare_workers_deployment.notification_orchestrator]
}

resource "cloudflare_worker" "backend_api" {
  account_id = var.cloudflare_account_id
  name       = var.backend_worker_script_name

  observability = {
    enabled             = true
    redact_query_string = true

    logs = {
      enabled         = true
      invocation_logs = true
    }
  }
}

resource "cloudflare_worker_version" "backend_api" {
  account_id         = var.cloudflare_account_id
  worker_id          = cloudflare_worker.backend_api.id
  compatibility_date = var.workers_compatibility_date
  main_module        = "backend-api.js"

  modules = [{
    name         = "backend-api.js"
    content_file = "${path.module}/workers/backend-api.js"
    content_type = "application/javascript+module"
  }]

  bindings = concat(
    [
      {
        type        = "r2_bucket"
        name        = "RECORDINGS_BUCKET"
        bucket_name = cloudflare_r2_bucket.recordings.name
      },
      {
        type        = "r2_bucket"
        name        = "SCREENSHOTS_BUCKET"
        bucket_name = cloudflare_r2_bucket.screenshots.name
      },
      {
        type       = "queue"
        name       = "NOTIFICATION_QUEUE"
        queue_name = cloudflare_queue.notification_orchestration.queue_name
      },
      {
        type = "hyperdrive"
        name = "HYPERDRIVE"
        id   = cloudflare_hyperdrive_config.postgres.id
      },
      {
        type          = "workflow"
        name          = "SESSION_TIMER_WORKFLOW"
        workflow_name = "session-timer-workflow"
        class_name    = "SessionTimerWorkflow"
      },
      {
        type          = "workflow"
        name          = "RECORDING_FINALIZATION_WORKFLOW"
        workflow_name = var.recording_finalization_workflow_name
        script_name   = var.notification_orchestrator_worker_script_name
        class_name    = var.recording_finalization_workflow_class_name
      },
      {
        type         = "ratelimit"
        name         = "PREMIUM_MARKETPLACE_RATE_LIMITER"
        namespace_id = "1001"
        simple = {
          limit  = 60
          period = 60
        }
      },
      {
        type = "plain_text"
        name = "REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL"
        text = "https://api.realtime.cloudflare.com/.well-known/webhooks.json"
      },
      {
        type                     = "send_email"
        name                     = "EMAIL"
        allowed_sender_addresses = [local.auth_email_from]
      },
      {
        type = "plain_text"
        name = "AUTH_EMAIL_FROM"
        text = local.auth_email_from
      },
    ],
    local.ai_gateway_base_url != "" ? [
      {
        type = "plain_text"
        name = "AI_GATEWAY_BASE_URL"
        text = local.ai_gateway_base_url
      }
    ] : []
  )

  lifecycle {
    ignore_changes = [
      bindings,
      compatibility_date,
      main_module,
      modules,
    ]
  }

  depends_on = [cloudflare_email_sending_subdomain.auth]
}

resource "cloudflare_workers_deployment" "backend_api" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_worker.backend_api.name
  strategy    = "percentage"

  versions = [{
    version_id = cloudflare_worker_version.backend_api.id
    percentage = 100
  }]

  lifecycle {
    ignore_changes = [versions]
  }
}

resource "cloudflare_workflow" "session_timer" {
  account_id    = var.cloudflare_account_id
  workflow_name = "session-timer-workflow"
  script_name   = cloudflare_worker.backend_api.name
  class_name    = "SessionTimerWorkflow"

  depends_on = [cloudflare_workers_deployment.backend_api]
}

resource "cloudflare_workers_script" "greedy_matcher" {
  account_id         = var.cloudflare_account_id
  script_name        = var.greedy_matcher_worker_script_name
  content_file       = "${path.module}/workers/greedy-matcher.js"
  content_sha256     = filesha256("${path.module}/workers/greedy-matcher.js")
  main_module        = "greedy-matcher.js"
  compatibility_date = var.workers_compatibility_date

  bindings = [
    {
      type = "hyperdrive"
      name = "HYPERDRIVE"
      id   = cloudflare_hyperdrive_config.postgres.id
    }
  ]
}

resource "cloudflare_workers_cron_trigger" "greedy_matcher" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.greedy_matcher.script_name

  schedules = [
    {
      cron = var.greedy_matcher_cron
    }
  ]
}

resource "cloudflare_workers_cron_trigger" "notification_orchestrator" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_worker.notification_orchestrator.name

  schedules = [
    {
      cron = var.notification_orchestrator_cron
    }
  ]
}

resource "cloudflare_queue_consumer" "notification_orchestrator" {
  account_id        = var.cloudflare_account_id
  queue_id          = cloudflare_queue.notification_orchestration.queue_id
  type              = "worker"
  script_name       = cloudflare_worker.notification_orchestrator.name
  dead_letter_queue = cloudflare_queue.notification_orchestration_dlq.queue_name

  settings = {
    batch_size       = var.queue_batch_size
    max_wait_time_ms = var.queue_max_wait_time_ms
    max_retries      = var.queue_max_retries
    retry_delay      = var.queue_retry_delay_seconds
  }
}
