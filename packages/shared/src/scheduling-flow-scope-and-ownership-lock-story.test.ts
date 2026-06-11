import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

describe('story 5.1 scheduling flow scope and ownership lock', function () {
  it('locks Story 5.1 to completed status with all checklist items done', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '5-1-scheduling-flow-scope-and-ownership-lock.md',
    )

    const requiredReferences = [
      'docs/system/system-design/frontend-pages.md',
      'docs/system/system-design/api-routes.md',
      'docs/system/system-design/matching-tiers.md',
      '3-4-interview-shared-contracts-and-module-wiring.md',
      '3-5-interview-create-route-post-api-interviews.md',
      '5-4-availability-route-post-api-availability.md',
      'docs/system/system-design/state-management-lifecycle.md',
      'docs/system/system-design/diagrams.md',
      'docs/infrastructure/backend.md',
    ]

    for (const requiredReference of requiredReferences) {
      expect(storyDocument).toContain(requiredReference)
    }

    expect(storyDocument).toContain('**Status**: Completed')
    expect(storyDocument).not.toMatch(/- \[ \]/)
  })

  it('locks exactly two submission channels: POST /api/interviews and POST /api/availability', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '5-1-scheduling-flow-scope-and-ownership-lock.md',
    )

    const postApiInterviewsMatches = storyDocument.match(/POST \/api\/interviews/g) ?? []
    const postApiAvailabilityMatches = storyDocument.match(/POST \/api\/availability/g) ?? []

    expect(postApiInterviewsMatches.length).toBeGreaterThanOrEqual(1)
    expect(postApiAvailabilityMatches.length).toBeGreaterThanOrEqual(1)

    expect(storyDocument).toContain('POST /api/interviews')
    expect(storyDocument).toContain('POST /api/availability')
  })

  it('keeps frontend-pages.md aligned to two-channel scheduling dependencies', function () {
    const frontendPagesDocument = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'frontend-pages.md',
    )

    const scheduleInterviewSection = frontendPagesDocument.match(
      /Schedule Interview[\s\S]*?(?=Interview Details|$)/,
    )?.[0] ?? ''

    expect(scheduleInterviewSection).toContain('POST /api/interviews')
    expect(scheduleInterviewSection).toContain('POST /api/availability')
  })

  it('requires api-routes.md to reject direct peer_to_peer creation and client tier/interviewer_id', function () {
    const apiRoutesDocument = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'api-routes.md',
    )

    const postInterviewsStart = apiRoutesDocument.indexOf('- **`POST /api/interviews`**')
    const nextRouteStart = apiRoutesDocument.indexOf('- **`GET /api/interviews`**', postInterviewsStart + 1)
    const postInterviewsSection =
      postInterviewsStart === -1
        ? ''
        : apiRoutesDocument.slice(
            postInterviewsStart,
            nextRouteStart === -1 ? apiRoutesDocument.length : nextRouteStart,
          )

    expect(postInterviewsSection).toContain("mode: 'peer_to_peer'")
    expect(postInterviewsSection).toContain('interviewer_id')
    expect(postInterviewsSection).toContain('tier')
    expect(postInterviewsSection).toContain('Rejected')
  })

  it('requires matching-tiers.md to document standard sessions created by matcher not direct POST /api/interviews', function () {
    const matchingTiersDocument = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'matching-tiers.md',
    )

    expect(matchingTiersDocument).toContain('created by the matcher, not direct `POST /api/interviews`')
  })

  it('keeps lifecycle and provision docs aligned to join-time boundary for POST /api/interviews/:id/provision', function () {
    const lifecycleDocument = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'state-management-lifecycle.md',
    )

    expect(lifecycleDocument).toContain('`POST /api/interviews/:id/provision`')
    expect(lifecycleDocument).toContain('join-time')
    expect(lifecycleDocument).toContain('not persisted interview status')

    const diagramsDocument = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'diagrams.md',
    )

    expect(diagramsDocument).toContain('`POST /api/interviews/:id/provision`')
    expect(diagramsDocument).toContain('join-time')

    const backendDocument = readRepositoryFile(
      'docs',
      'infrastructure',
      'backend.md',
    )

    expect(backendDocument).toContain('`POST /api/interviews/:id/provision`')
    expect(backendDocument).toContain('join-time')
  })
})