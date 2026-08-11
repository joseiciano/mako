import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

describe('story 4.1 notification scope and lifecycle boundary lock', function () {
  it('keeps Story 4.1 marked completed with no unchecked items and required references', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '4-1-notification-scope-and-lifecycle-boundary-lock.md',
    )

    const requiredReferences = [
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-8-interview-post-commit-events-and-notification-contract.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md',
      'docs/system/system-design/state-management-lifecycle.md',
      'docs/system/system-design/diagrams.md',
      'docs/system/system-design/api-routes.md',
      'docs/infrastructure/backend.md',
      'docs/infrastructure/management.md',
    ]

    for (const requiredReference of requiredReferences) {
      expect(storyDocument).toContain(requiredReference)
    }

    expect(storyDocument).toContain('**Status**: Completed')
    expect(storyDocument).not.toMatch(/- \[ \]/)
  })

  it('locks notification trigger boundary to post-commit only with explicit out-of-scope guardrails', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '4-1-notification-scope-and-lifecycle-boundary-lock.md',
    )

    expect(storyDocument).toContain(
      'Accept only post-commit interview lifecycle signals as notification triggers.',
    )
    expect(storyDocument).toContain(
      'Disallow in-transaction notification side effects for create/cancel/match/premium-booked paths.',
    )
    expect(storyDocument).toContain('`POST /api/interviews/:id/provision`')
    expect(storyDocument).toContain(
      'Keep Realtime and whiteboard provisioning out of scope for notification processing.',
    )
  })

  it('keeps system docs asserting provisioning is join-time route behavior and not queue-triggered', function () {
    const stateManagementLifecycle = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'state-management-lifecycle.md',
    )
    const apiRoutes = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'api-routes.md',
    )
    const backend = readRepositoryFile('docs', 'infrastructure', 'backend.md')
    const management = readRepositoryFile(
      'docs',
      'infrastructure',
      'management.md',
    )

    expect(stateManagementLifecycle).toContain(
      'This is **not** queue-triggered provisioning.',
    )
    expect(apiRoutes).toContain(
      'Provisioning is join-time runtime behavior and does not introduce a separate persisted interview `status`.',
    )
    expect(backend).toContain(
      'Realtime session provisioning remains join-time route behavior (`POST /api/interviews/:id/provision`) rather than queue-triggered behavior.',
    )
    expect(management).toContain(
      'async post-commit worker hand-off (notification/orchestration events, not join-time session provisioning).',
    )
  })
})
