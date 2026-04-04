import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

describe('story 2.1 dashboard scope and contract lock', function () {
  it('keeps scope and dependency gates explicitly documented and completed', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '2-1-dashboard-scope-and-contract-lock.md',
    )

    const requiredReferences = [
      'docs/system/system-design/frontend-pages.md',
      'docs/product/stories/milestones.md',
      'docs/product/system-pitch.md',
      'docs/system/system-design/api-routes.md',
      '2-2-dashboard-route-architecture-and-auth-integration.md',
      '2-3-dashboard-data-hooks-and-query-contracts.md',
      '2-4-dashboard-ui-states-and-list-rendering.md',
      '3-4-interview-shared-contracts-and-module-wiring.md',
      '3-6-interview-list-route-get-api-interviews.md',
      'GET /api/account',
      'GET /api/interviews?status=scheduled',
    ]

    for (const requiredReference of requiredReferences) {
      expect(storyDocument).toContain(requiredReference)
    }

    expect(storyDocument).toContain('**Status**: Completed')
    expect(storyDocument).toContain('upcoming interviews')
    expect(storyDocument).toContain(
      'quick stats (credits + free Standard/AI balances)',
    )
    expect(storyDocument).toContain('interview creation flow (`/interviews/new`)')
    expect(storyDocument).toContain('cancellation actions')
    expect(storyDocument).toContain('full interview history page behavior (`/interviews`)')
    expect(storyDocument).not.toMatch(/- \[ \]/)
  })

  it('keeps dashboard source-of-truth route/data contracts aligned', function () {
    const frontendPagesDocument = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'frontend-pages.md',
    )
    const apiRoutesDocument = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'api-routes.md',
    )

    expect(frontendPagesDocument).toContain('Dashboard (`/dashboard`)')
    expect(frontendPagesDocument).toContain('GET /api/account')
    expect(frontendPagesDocument).toContain('GET /api/interviews?status=scheduled')
    expect(frontendPagesDocument).toContain('Interviews History (`/interviews`)')
    expect(frontendPagesDocument).toContain('Data**: `GET /api/interviews`')

    expect(apiRoutesDocument).toContain('- **`GET /api/interviews`**')
    expect(apiRoutesDocument).toContain('"scheduler_alias"')
    expect(apiRoutesDocument).toContain('"interviewer_alias"')
    expect(apiRoutesDocument).toContain('"status"')
    expect(apiRoutesDocument).toContain('"scheduled_at"')
  })
})
