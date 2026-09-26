import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

describe('story 4.3 notification transport reliability and idempotency lock', function () {
  it('orchestrated deploy workflow deploys notification-orchestrator with Hyperdrive injection', function () {
    const deployWorkflow = readRepositoryFile(
      '.github',
      'workflows',
      'deploy-applications.yml',
    )
    const orchestratorWorkflow = readRepositoryFile(
      '.github',
      'workflows',
      'deploy.yml',
    )

    // The notification-orchestrator deployment is the reusable application
    // workflow, invoked (with dependency ordering) by the sole orchestrator.
    expect(deployWorkflow).toContain('deploy-notification-orchestrator:')
    expect(deployWorkflow).toContain(
      'Deploy notification-orchestrator worker (${{ inputs.environment }})',
    )
    expect(deployWorkflow).toContain('workingDirectory: apps/notification-orchestrator')
    expect(deployWorkflow).toContain(
      'Inject Hyperdrive binding ID into notification-orchestrator Wrangler config',
    )
    expect(deployWorkflow).toContain('Missing HYPERDRIVE_ID')
    // The DLQ is Terraform-owned; the workflow must not create queues inline.
    expect(deployWorkflow).not.toContain('wrangler queues create notification-orchestration-dlq')
    expect(deployWorkflow).not.toContain('Queue already exists')

    expect(orchestratorWorkflow).toContain('deploy-applications.yml')
    expect(orchestratorWorkflow).toContain('needs:')
  })

  it('notification-orchestrator queue consumer config keeps DLQ for exhausted retries', function () {
    const notificationOrchestratorWrangler = readRepositoryFile(
      'apps',
      'notification-orchestrator',
      'wrangler.jsonc',
    )
    const terraformMain = readRepositoryFile('infrastructure', 'main.tf')

    expect(notificationOrchestratorWrangler).toContain(
      '"dead_letter_queue": "notification-orchestration-dlq"',
    )
    // The consumer's DLQ contract is enforced twice: Wrangler config and the
    // Terraform queue consumer.
    expect(terraformMain).toContain('dead_letter_queue = cloudflare_queue.notification_orchestration_dlq.queue_name')
  })

  it('locks notification-oriented queue and worker naming across terraform and worker placeholders', function () {
    const terraformMain = readRepositoryFile('infrastructure', 'main.tf')
    const greedyMatcherWorker = readRepositoryFile('infrastructure', 'workers', 'greedy-matcher.js')
    const backendApiWorker = readRepositoryFile('infrastructure', 'workers', 'backend-api.js')
    const notificationOrchestratorWorker = readRepositoryFile(
      'infrastructure',
      'workers',
      'notification-orchestrator.js',
    )
    const backendRestWrangler = readRepositoryFile('apps', 'backend-rest', 'wrangler.jsonc')
    const backendRestIndex = readRepositoryFile('apps', 'backend-rest', 'src', 'index.ts')
    const sessionTimerWorkflow = readRepositoryFile(
      'apps',
      'backend-rest',
      'src',
      'workflows',
      'session-timer-workflow.ts',
    )

    expect(terraformMain).toContain('resource "cloudflare_queue" "notification_orchestration"')
    expect(terraformMain).toContain('resource "cloudflare_queue" "notification_orchestration_dlq"')
    expect(terraformMain).toContain('queue_name = "notification-orchestration-dlq"')
    expect(terraformMain).not.toContain('var.notification_orchestration_dlq_queue_name')
    expect(terraformMain).toContain(
      'resource "cloudflare_queue_consumer" "notification_orchestrator"',
    )
    expect(terraformMain).toContain(
      'queue_name = cloudflare_queue.notification_orchestration.queue_name',
    )
    expect(terraformMain).toContain(
      'script_name       = cloudflare_worker.notification_orchestrator.name',
    )
    expect(terraformMain).toContain('dead_letter_queue = cloudflare_queue.notification_orchestration_dlq.queue_name')

    expect(terraformMain).not.toContain('interview_provisioning')
    expect(terraformMain).not.toContain('interview_provisioner')

    expect(greedyMatcherWorker).toContain('MUST NOT send any messages to the notification')
    expect(greedyMatcherWorker).not.toContain('env.NOTIFICATION_QUEUE.send(payload)')
    expect(greedyMatcherWorker).not.toContain('INTERVIEW_PROVISIONING_QUEUE')

    expect(backendApiWorker).toContain('env.NOTIFICATION_QUEUE ? "configured" : "missing"')
    expect(backendApiWorker).not.toContain('INTERVIEW_PROVISIONING_QUEUE')

    expect(notificationOrchestratorWorker).toContain('notification-orchestrator bootstrap defers message')
    expect(notificationOrchestratorWorker).toContain('message.retry()')
    expect(notificationOrchestratorWorker).not.toContain('message.ack()')
    expect(notificationOrchestratorWorker).not.toContain('interview-provisioner')

    expect(backendRestWrangler).toContain('"binding": "NOTIFICATION_QUEUE"')
    expect(backendRestWrangler).toContain('"queue": "notification-orchestration"')
    expect(backendRestWrangler).not.toContain('INTERVIEW_PROVISIONING_QUEUE')
    expect(backendRestWrangler).not.toContain('interview-provisioning')

    expect(backendRestIndex).toContain('context.bindings.NOTIFICATION_QUEUE')
    expect(backendRestIndex).not.toContain('INTERVIEW_PROVISIONING_QUEUE')

    expect(sessionTimerWorkflow).toContain('env.NOTIFICATION_QUEUE')
    expect(sessionTimerWorkflow).not.toContain('INTERVIEW_PROVISIONING_QUEUE')
  })

  it('keeps realtime and workflow ownership separate from notification transport', function () {
    const terraformMain = readRepositoryFile('infrastructure', 'main.tf')
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '4-3-notification-transport-reliability-and-idempotency.md',
    )

    // In-session lifecycle timers stay on the backend worker's own workflow;
    // the notification transport has no interview_lifecycle workflow resource.
    expect(terraformMain).toContain('resource "cloudflare_workflow" "session_timer"')
    expect(terraformMain).not.toContain('resource "cloudflare_workflow" "interview_lifecycle"')
    expect(storyDocument).toContain(
      'Keep Cloudflare Workflow ownership separate for in-session lifecycle timers.',
    )
    expect(storyDocument).toContain(
      'Keep Realtime/whiteboard provisioning out of this transport path.',
    )
  })

  it('marks the naming reconciliation task as completed in Story 4.3', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '4-3-notification-transport-reliability-and-idempotency.md',
    )

    expect(storyDocument).toContain(
      '- [x] Reconcile any legacy queue/worker/binding naming that still implies interview provisioning with the Milestone 2 notification-orchestration purpose across Terraform, worker entrypoints, backend bindings, and related docs.',
    )
  })

  it('keeps terraform notification-orchestrator as create-only bootstrap while wrangler owns runtime config', function () {
    const terraformMain = readRepositoryFile('infrastructure', 'main.tf')

    // Provider v5.25 split-resource model: Terraform owns the identity and one
    // create-only bootstrap version/deployment; every mutable field Wrangler
    // controls is lifecycle-ignored so a later apply can never upload bootstrap
    // content over the Wrangler application version or move traffic back.
    const identityBlock =
      terraformMain.match(/resource "cloudflare_worker" "notification_orchestrator" \{[\s\S]*?\n\}/)?.[0] ?? ''
    const versionBlock =
      terraformMain.match(/resource "cloudflare_worker_version" "notification_orchestrator" \{[\s\S]*?\n\}/)?.[0] ?? ''
    const deploymentBlock =
      terraformMain.match(/resource "cloudflare_workers_deployment" "notification_orchestrator" \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(identityBlock).toContain(
      'resource "cloudflare_worker" "notification_orchestrator"',
    )
    expect(identityBlock).toContain('name       = var.notification_orchestrator_worker_script_name')

    expect(versionBlock).toContain('lifecycle {')
    expect(versionBlock).toContain('ignore_changes = [')
    expect(versionBlock).toContain('bindings')
    expect(versionBlock).toContain('compatibility_date')
    expect(versionBlock).toContain('main_module')
    expect(versionBlock).toContain('modules')
    // Bootstrap content only: the real application bundle is deployed by Wrangler.
    expect(versionBlock).toContain('"${path.module}/workers/notification-orchestrator.js"')

    expect(deploymentBlock).toContain('strategy    = "percentage"')
    expect(deploymentBlock).toContain('ignore_changes = [versions]')

    // The bootstrap version carries the transport bindings a fresh environment
    // needs before Wrangler takes over.
    expect(versionBlock).toContain('name       = "NOTIFICATION_QUEUE"')
    expect(versionBlock).toContain(
      'queue_name = cloudflare_queue.notification_orchestration.queue_name',
    )
    expect(versionBlock).toContain('name = "HYPERDRIVE"')
    expect(versionBlock).not.toContain('name = "REALTIME_APP_ID"')
  })
})
