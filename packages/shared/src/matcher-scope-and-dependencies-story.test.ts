import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

describe('story 1.1 matcher scope and dependency lock', function () {
  it('keeps required source-of-truth references and explicit boundaries', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '1-1-matcher-scope-and-dependencies.md',
    )

    const requiredReferences = [
      'docs/system/system-design/matching-tiers.md',
      'docs/system/system-design/concurrency-data-integrity.md',
      'docs/system/system-design/db-schemas.md',
      'docs/system/system-design/state-management-lifecycle.md',
      'docs/system/system-design/diagrams.md',
      'docs/infrastructure/backend.md',
      'docs/infrastructure/management.md',
      'docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md',
      'POST /api/interviews/:id/provision',
    ]

    for (const requiredReference of requiredReferences) {
      expect(storyDocument).toContain(requiredReference)
    }

    expect(storyDocument).toContain('**Status**: Completed')
    expect(storyDocument).toContain('**Standard tier availability matching** only')
    expect(storyDocument).toContain('Premium first-to-claim matching and AI-led scheduling are out of scope')
    expect(storyDocument).not.toMatch(/- \[ \]/)
  })

  it('keeps greedy matcher runtime dependencies locked to cron and queue hand-off', function () {
    const terraformMain = readRepositoryFile('infrastructure', 'main.tf')
    const greedyMatcherWorker = readRepositoryFile('infrastructure', 'workers', 'greedy-matcher.js')

    expect(terraformMain).toContain('resource "cloudflare_workers_cron_trigger" "greedy_matcher"')
    expect(terraformMain).toContain('script_name = cloudflare_workers_script.greedy_matcher.script_name')
    expect(terraformMain).toContain('resource "cloudflare_queue" "interview_provisioning"')
    expect(terraformMain).toContain('resource "cloudflare_queue_consumer" "interview_provisioner"')
    expect(terraformMain).toContain('queue_name = cloudflare_queue.interview_provisioning.queue_name')

    expect(greedyMatcherWorker).toContain('async scheduled')
    expect(greedyMatcherWorker).toContain('env.INTERVIEW_PROVISIONING_QUEUE.send(payload)')
    expect(greedyMatcherWorker).not.toMatch(/realtime|excalidraw|\/api\/interviews\/:id\/provision/i)
  })
})
