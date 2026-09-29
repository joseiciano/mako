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
    // Queues are bootstrap-owned; the workflow must not create queues inline.
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
    const bootstrap = readRepositoryFile('scripts', 'bootstrap.sh')

    expect(notificationOrchestratorWrangler).toContain(
      '"dead_letter_queue": "notification-orchestration-dlq"',
    )
    // The DLQ is created by the bootstrap (not inline in the deploy workflow),
    // and the consumer's dead-letter target is pinned in the wrangler config.
    expect(bootstrap).toContain('notification-orchestration-dlq')
  })

  it('locks notification-oriented queue and worker naming across wrangler configs and workflow classes', function () {
    const backendRestWrangler = readRepositoryFile('apps', 'backend-rest', 'wrangler.jsonc')
    const orchestratorWrangler = readRepositoryFile('apps', 'notification-orchestrator', 'wrangler.jsonc')
    const backendRestIndex = readRepositoryFile('apps', 'backend-rest', 'src', 'index.ts')
    const sessionTimerWorkflow = readRepositoryFile(
      'apps',
      'backend-rest',
      'src',
      'workflows',
      'session-timer-workflow.ts',
    )

    // Terraform ownership was removed by the wrangler migration
    // (plans/wrangler-migration.md): the queue and worker names are pinned in
    // the committed wrangler configs, and the bootstrap script provisions the
    // queues with the same stable names.
    const bootstrap = readRepositoryFile('scripts', 'bootstrap.sh')
    expect(bootstrap).toContain('notification-orchestration')
    expect(bootstrap).toContain('notification-orchestration-dlq')
    expect(orchestratorWrangler).toContain('"binding": "NOTIFICATION_QUEUE"')
    expect(orchestratorWrangler).toContain('"queue": "notification-orchestration"')
    expect(orchestratorWrangler).toContain('"dead_letter_queue": "notification-orchestration-dlq"')
    expect(orchestratorWrangler).not.toContain('INTERVIEW_PROVISIONING_QUEUE')
    expect(orchestratorWrangler).not.toContain('interview-provisioning')
    expect(orchestratorWrangler).not.toContain('interview_provisioner')

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
    const backendRestWrangler = readRepositoryFile('apps', 'backend-rest', 'wrangler.jsonc')
    const orchestratorWrangler = readRepositoryFile('apps', 'notification-orchestrator', 'wrangler.jsonc')
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '4-3-notification-transport-reliability-and-idempotency.md',
    )

    // In-session lifecycle timers stay on the backend worker's own workflow;
    // the notification transport has no interview_lifecycle workflow anywhere.
    expect(backendRestWrangler).toContain('"name": "session-timer-workflow"')
    expect(backendRestWrangler).not.toContain('interview-lifecycle')
    expect(orchestratorWrangler).not.toContain('interview-lifecycle')
    expect(orchestratorWrangler).toContain('"name": "feedback-workflow"')
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

})
