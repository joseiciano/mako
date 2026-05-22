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

    expect(terraformMain).toContain('resource "cloudflare_queue" "notification_orchestration"')
    expect(terraformMain).toContain(
      'resource "cloudflare_queue_consumer" "notification_orchestrator"',
    )
    expect(terraformMain).toContain(
      'queue_name = cloudflare_queue.notification_orchestration.queue_name',
    )
    expect(terraformMain).toContain(
      'script_name = cloudflare_workers_script.notification_orchestrator.script_name',
    )

    expect(terraformMain).not.toContain('interview_provisioning')
    expect(terraformMain).not.toContain('interview_provisioner')

    expect(greedyMatcherWorker).toContain('MUST NOT send any messages to the notification')
    expect(greedyMatcherWorker).not.toContain('env.NOTIFICATION_QUEUE.send(payload)')
    expect(greedyMatcherWorker).not.toContain('INTERVIEW_PROVISIONING_QUEUE')

    expect(backendApiWorker).toContain('env.NOTIFICATION_QUEUE ? "configured" : "missing"')
    expect(backendApiWorker).not.toContain('INTERVIEW_PROVISIONING_QUEUE')

    expect(notificationOrchestratorWorker).toContain('notification-orchestrator message')
    expect(notificationOrchestratorWorker).not.toContain('interview-provisioner')

    expect(backendRestWrangler).toContain('"binding": "NOTIFICATION_QUEUE"')
    expect(backendRestWrangler).toContain('"queue": "notification-orchestration"')
    expect(backendRestWrangler).not.toContain('INTERVIEW_PROVISIONING_QUEUE')
    expect(backendRestWrangler).not.toContain('interview-provisioning')

    expect(backendRestIndex).toContain('NOTIFICATION_QUEUE?: Queue')
    expect(backendRestIndex).not.toContain('INTERVIEW_PROVISIONING_QUEUE')
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

    expect(terraformMain).toContain('resource "cloudflare_workflow" "interview_lifecycle"')
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
