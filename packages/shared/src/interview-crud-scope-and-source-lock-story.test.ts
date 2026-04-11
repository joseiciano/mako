import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

describe('story 3.1 interview CRUD scope and source lock', function () {
  it('locks Story 3.1 to create/list/cancel and explicit follow-up ownership', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '3-1-interview-crud-scope-and-source-lock.md',
    )

    const requiredReferences = [
      '`POST /api/interviews`',
      '`GET /api/interviews`',
      '`POST /api/interviews/:id/cancel`',
      '`GET /api/interviews/:id`',
      '`POST /api/interviews/:id/provision`',
      'docs/system/system-design/api-routes.md',
      'docs/system/system-design/frontend-pages.md',
      'docs/system/system-design/state-management-lifecycle.md',
      'docs/system/system-design/diagrams.md',
      'docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-9-interview-details-route-get-api-interviews-id.md',
      'docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-2-whiteboard-provision-contract-and-backend-wiring.md',
    ]

    for (const requiredReference of requiredReferences) {
      expect(storyDocument).toContain(requiredReference)
    }

    expect(storyDocument).toContain('**Status**: Completed')
    expect(storyDocument).not.toMatch(/- \[ \]/)
  })

  it('keeps frontend lifecycle pages aligned to explicit out-of-scope follow-up stories', function () {
    const frontendPagesDocument = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'frontend-pages.md',
    )

    expect(frontendPagesDocument).toContain(
      '`GET /api/interviews/:id` is documented as a lifecycle page dependency',
    )
    expect(frontendPagesDocument).toContain(
      'docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-9-interview-details-route-get-api-interviews-id.md',
    )
    expect(frontendPagesDocument).toContain(
      '`POST /api/interviews/:id/provision` is documented as a join-time lifecycle dependency',
    )
    expect(frontendPagesDocument).toContain(
      'docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-2-whiteboard-provision-contract-and-backend-wiring.md',
    )
  })

  it('guards Milestone 2 Story 3 subtasks from details/provision route ownership', function () {
    const milestoneTwoStoryThreeSubtasks = [
      '3-2-interview-create-mode-tier-policy-matrix.md',
      '3-3-interview-db-schema-migrations-and-index-readiness.md',
      '3-4-interview-shared-contracts-and-module-wiring.md',
      '3-5-interview-create-route-post-api-interviews.md',
      '3-6-interview-list-route-get-api-interviews.md',
      '3-7-interview-cancel-route-post-api-interviews-id-cancel.md',
      '3-8-interview-post-commit-events-and-notification-contract.md',
    ]

    for (const storyFileName of milestoneTwoStoryThreeSubtasks) {
      const storyDocument = readRepositoryFile(
        'docs',
        'product',
        'stories',
        'stories',
        'milestone-2-interview-scheduling-dashboard',
        storyFileName,
      )

      expect(storyDocument).not.toContain('`GET /api/interviews/:id`')
      expect(storyDocument).not.toContain('`POST /api/interviews/:id/provision`')
    }
  })
})
