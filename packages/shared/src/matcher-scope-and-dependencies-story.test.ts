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
    const matcherWrangler = readRepositoryFile('apps', 'greedy-matcher', 'wrangler.jsonc')
    const matcherSource = readRepositoryFile('apps', 'greedy-matcher', 'src', 'index.ts')
    const orchestratorWrangler = readRepositoryFile('apps', 'notification-orchestrator', 'wrangler.jsonc')

    // Terraform ownership was removed by the wrangler migration
    // (plans/wrangler-migration.md): the cron schedule and queue names are
    // pinned in committed wrangler configs, and the bootstrap provisions the
    // queues with the same stable names.
    expect(matcherWrangler).toContain('mako-greedy-matcher')
    expect(matcherWrangler).toContain('*/10 * * * *')
    expect(orchestratorWrangler).toContain('"queue": "notification-orchestration"')

    expect(matcherSource).toContain('async scheduled')
    expect(matcherSource).toContain('MUST NOT send any messages to the notification')
    expect(matcherSource).not.toContain('env.NOTIFICATION_QUEUE.send(payload)')
    expect(matcherSource).not.toMatch(/realtime|excalidraw|\/api\/interviews\/:id\/provision/i)
  })
})
