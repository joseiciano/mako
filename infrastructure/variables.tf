variable "environment" {
  description = "Deployment environment provisioned by this Terraform state."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production."
  }
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID where resources will be provisioned."
  type        = string
}

variable "email_sending_zone_id" {
  description = "Cloudflare zone ID that contains the environment's Email Sending domain."
  type        = string

  validation {
    condition     = trimspace(var.email_sending_zone_id) != ""
    error_message = "email_sending_zone_id must not be empty."
  }
}

variable "email_sending_domain" {
  description = "Lowercase Email Sending domain within the selected Cloudflare zone."
  type        = string

  validation {
    condition = (
      var.email_sending_domain == lower(trimspace(var.email_sending_domain)) &&
      length(var.email_sending_domain) <= 253 &&
      can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$", var.email_sending_domain))
    )
    error_message = "email_sending_domain must be a lowercase fully qualified domain name without a scheme, path, port, whitespace, wildcard, or @."
  }
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with account-level permissions for Workers, Queues, R2, Hyperdrive, and Workflows."
  type        = string
  default     = ""
  sensitive   = true
}

variable "neon_api_key" {
  description = "Neon API key used by the Terraform Neon provider."
  type        = string
  default     = ""
  sensitive   = true
}

variable "neon_org_id" {
  description = "Optional Neon organization ID."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Base project slug used for naming resources."
  type        = string
  default     = "mako"
}

variable "workers_compatibility_date" {
  description = "Cloudflare Workers compatibility date."
  type        = string
  default     = "2026-03-15"
}

variable "backend_worker_script_name" {
  description = "Script name for the main backend API Worker."
  type        = string
  default     = "mako-backend-rest"
}

variable "greedy_matcher_worker_script_name" {
  description = "Script name for the cron-triggered greedy matcher Worker."
  type        = string
  default     = "mako-greedy-matcher"
}

variable "notification_orchestrator_worker_script_name" {
  description = "Script name for the queue-triggered notification orchestrator Worker."
  type        = string
  default     = "mako-notification-orchestrator"
}
variable "feedback_workflow_name" {
  description = "Workflow name for interview feedback processing."
  type        = string
  default     = "feedback-workflow"
}

variable "feedback_workflow_class_name" {
  description = "Workflow class exported by the notification orchestrator for feedback processing."
  type        = string
  default     = "InterviewFeedbackWorkflow"
}

variable "recording_finalization_workflow_name" {
  description = "Workflow name for recording finalization processing."
  type        = string
  default     = "recording-finalization-workflow"
}

variable "recording_finalization_workflow_class_name" {
  description = "Workflow class exported by the notification orchestrator for recording finalization."
  type        = string
  default     = "RecordingFinalizationWorkflow"
}

variable "recordings_bucket_name" {
  description = "R2 bucket name for interview recordings."
  type        = string
  default     = "mako-recordings"
}

variable "screenshots_bucket_name" {
  description = "R2 bucket name for screenshots and whiteboard captures."
  type        = string
  default     = "mako-screenshots"
}

variable "r2_location" {
  description = "R2 bucket location hint (apac, eeur, enam, weur, wnam, oc)."
  type        = string
  default     = "enam"
}

variable "notification_orchestration_queue_name" {
  description = "Queue name for notification orchestration hand-off."
  type        = string
  default     = "notification-orchestration"
}

variable "greedy_matcher_cron" {
  description = "Cron expression for the Greedy Matcher Worker."
  type        = string
  default     = "*/10 * * * *"
}

variable "notification_orchestrator_cron" {
  description = "Cron expression for the Notification Orchestrator scheduled sweep."
  type        = string
  default     = "*/5 * * * *"
}

variable "ai_gateway_name" {
  description = "Optional Cloudflare AI Gateway name. When set, the responder routes through the AI Gateway for observability and routing."
  type        = string
  default     = ""
}

variable "neon_region_id" {
  description = "Neon region ID for database projects."
  type        = string
  default     = "aws-us-east-1"
}

variable "neon_pg_version" {
  description = "Postgres major version for Neon projects."
  type        = number
  default     = 17
}

variable "neon_database_name" {
  description = "Application database name created in each Neon project."
  type        = string
  default     = "mako"
}

variable "neon_app_role_name" {
  description = "Application role created in each Neon project."
  type        = string
  default     = "mako_app"
}

variable "hyperdrive_connection_limit" {
  description = "Soft limit on origin connections Hyperdrive can open."
  type        = number
  default     = 20
}

variable "hyperdrive_cache_max_age_seconds" {
  description = "Hyperdrive SQL cache max-age in seconds."
  type        = number
  default     = 60
}

variable "hyperdrive_cache_stale_seconds" {
  description = "Hyperdrive stale-while-revalidate in seconds."
  type        = number
  default     = 15
}

variable "queue_batch_size" {
  description = "Maximum messages per queue consumer batch."
  type        = number
  default     = 10
}

variable "queue_max_wait_time_ms" {
  description = "Queue consumer max wait time to form a batch."
  type        = number
  default     = 5000
}

variable "queue_max_retries" {
  description = "Maximum retries per queue message."
  type        = number
  default     = 3
}

variable "queue_retry_delay_seconds" {
  description = "Delay between queue consumer retries."
  type        = number
  default     = 30
}

