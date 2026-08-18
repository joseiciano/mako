locals {
  environments = {
    development = "dev"
    production  = "prod"
  }

  ai_gateway_base_url = var.ai_gateway_name != "" ? "https://gateway.ai.cloudflare.com/v1/${var.cloudflare_account_id}/${var.ai_gateway_name}" : ""
}

resource "neon_project" "db" {
  for_each = local.environments

  name                      = "${var.project_name}-${each.value}"
  org_id                    = var.neon_org_id != "" ? var.neon_org_id : null
  region_id                 = var.neon_region_id
  pg_version                = var.neon_pg_version
  history_retention_seconds = 21600
  store_password            = "yes"
}

resource "neon_role" "app" {
  for_each = neon_project.db

  project_id = each.value.id
  branch_id  = each.value.default_branch_id
  name       = var.neon_app_role_name
}

resource "neon_database" "app" {
  for_each = neon_project.db

  project_id = each.value.id
  branch_id  = each.value.default_branch_id
  name       = var.neon_database_name
  owner_name = neon_role.app[each.key].name
}

resource "cloudflare_hyperdrive_config" "postgres" {
  for_each = neon_project.db

  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-${each.key}-hyperdrive"

  origin = {
    scheme   = "postgresql"
    host     = each.value.database_host
    port     = 5432
    database = each.value.database_name
    user     = each.value.database_user
    password = each.value.database_password
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

  rule {
    id      = "30-day-raw-artifact-retention"
    enabled = true

    abort_incomplete_multipart_uploads {
      days_after_initiation = 1
    }

    expiration {
      days = 30
    }
  }
}

resource "cloudflare_r2_bucket_lifecycle" "screenshots_retention" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.screenshots.name

  rule {
    id      = "30-day-raw-artifact-retention"
    enabled = true

    abort_incomplete_multipart_uploads {
      days_after_initiation = 1
    }

    expiration {
      days = 30
    }
  }
}

resource "cloudflare_queue" "notification_orchestration" {
  account_id = var.cloudflare_account_id
  queue_name = var.notification_orchestration_queue_name
}

resource "cloudflare_queue" "notification_orchestration_dlq" {
  account_id = var.cloudflare_account_id
  queue_name = "notification-orchestration-dlq"
}

resource "cloudflare_workers_script" "notification_orchestrator" {
  account_id         = var.cloudflare_account_id
  script_name        = var.notification_orchestrator_worker_script_name
  content_file       = "${path.module}/workers/notification-orchestrator.js"
  content_sha256     = filesha256("${path.module}/workers/notification-orchestrator.js")
  main_module        = "notification-orchestrator.js"
  compatibility_date = var.workers_compatibility_date

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
      id   = cloudflare_hyperdrive_config.postgres["production"].id
    },
    {
      type          = "workflow"
      name          = "FEEDBACK_WORKFLOW"
      workflow_name = cloudflare_workflow.interview_feedback.workflow_name
      script_name   = cloudflare_workers_script.notification_orchestrator.script_name
    },
    {
      type          = "workflow"
      name          = "RECORDING_FINALIZATION_WORKFLOW"
      workflow_name = cloudflare_workflow.recording_finalization.workflow_name
      script_name   = cloudflare_workers_script.notification_orchestrator.script_name
    },
    {
      type = "ai"
      name = "AI"
    }
  ]

  lifecycle {
    ignore_changes = [
      content_file,
      content_sha256,
      main_module,
      compatibility_date,
    ]
  }
}

resource "cloudflare_workflow" "interview_feedback" {
  account_id    = var.cloudflare_account_id
  workflow_name = var.feedback_workflow_name
  script_name   = cloudflare_workers_script.notification_orchestrator.script_name
  class_name    = var.feedback_workflow_class_name
}

resource "cloudflare_workflow" "interview_lifecycle" {
  account_id    = var.cloudflare_account_id
  workflow_name = var.interview_workflow_name
  script_name   = cloudflare_workers_script.notification_orchestrator.script_name
  class_name    = var.interview_workflow_class_name
}

resource "cloudflare_workflow" "recording_finalization" {
  account_id    = var.cloudflare_account_id
  workflow_name = var.recording_finalization_workflow_name
  script_name   = cloudflare_workers_script.notification_orchestrator.script_name
  class_name    = var.recording_finalization_workflow_class_name
}

resource "cloudflare_workers_script" "backend_api" {
  account_id         = var.cloudflare_account_id
  script_name        = var.backend_worker_script_name
  content_file       = "${path.module}/workers/backend-api.js"
  content_sha256     = filesha256("${path.module}/workers/backend-api.js")
  main_module        = "backend-api.js"
  compatibility_date = var.workers_compatibility_date

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
        id   = cloudflare_hyperdrive_config.postgres["production"].id
      },
      {
        type          = "workflow"
        name          = "INTERVIEW_WORKFLOW"
        workflow_name = cloudflare_workflow.interview_lifecycle.workflow_name
        script_name   = cloudflare_workers_script.notification_orchestrator.script_name
      },
      {
        type          = "workflow"
        name          = "RECORDING_FINALIZATION_WORKFLOW"
        workflow_name = cloudflare_workflow.recording_finalization.workflow_name
        script_name   = cloudflare_workers_script.notification_orchestrator.script_name
      },
      {
        type = "plain_text"
        name = "CLOUDFLARE_REALTIMEKIT_APP_ID"
        text = var.realtime_app_id
      }
    ],
    local.ai_gateway_base_url != "" ? [
      {
        type = "plain_text"
        name = "AI_GATEWAY_BASE_URL"
        text = local.ai_gateway_base_url
      }
    ] : []
  )
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
      id   = cloudflare_hyperdrive_config.postgres["production"].id
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

resource "cloudflare_queue_consumer" "notification_orchestrator" {
  account_id  = var.cloudflare_account_id
  queue_id    = cloudflare_queue.notification_orchestration.queue_id
  type        = "worker"
  script_name = cloudflare_workers_script.notification_orchestrator.script_name
  dead_letter_queue = cloudflare_queue.notification_orchestration_dlq.queue_name

  settings = {
    batch_size       = var.queue_batch_size
    max_wait_time_ms = var.queue_max_wait_time_ms
    max_retries      = var.queue_max_retries
    retry_delay      = var.queue_retry_delay_seconds
  }
}
