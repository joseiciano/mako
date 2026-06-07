import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

describe('story 3.8 interview post-commit events and notification contract', function () {
  it('keeps Story 3.8 marked completed with no unchecked items and required references', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '3-8-interview-post-commit-events-and-notification-contract.md',
    )

    const requiredReferences = [
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md',
      'docs/infrastructure/backend.md',
      'docs/infrastructure/management.md',
    ]

    for (const requiredReference of requiredReferences) {
      expect(storyDocument).toContain(requiredReference)
    }

    expect(storyDocument).toContain('**Status**: Completed')
    expect(storyDocument).not.toMatch(/- \[ \]/)
  })

  it('locks post-commit-only emission and commit-safe event boundaries', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '3-8-interview-post-commit-events-and-notification-contract.md',
    )

    expect(storyDocument).toContain('Emit only after successful commit')
    expect(storyDocument).toContain('do not emit lifecycle events when transaction fails/rolls back')
    expect(storyDocument).toContain('post-commit only')
  })

  it('locks create/cancel producer ownership and matcher ownership of interview.match.created', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '3-8-interview-post-commit-events-and-notification-contract.md',
    )

    expect(storyDocument).toContain('interview.created')
    expect(storyDocument).toContain('interview.cancelled')
    expect(storyDocument).toContain('interview.match.created')
    expect(storyDocument).toContain('CRUD emits create/cancel')
    expect(storyDocument).toContain('matcher emits')
  })

  it('keeps reminder/confirmation orchestration out of transaction scope', function () {
    const storyDocument = readRepositoryFile(
      'docs',
      'product',
      'stories',
      'stories',
      'milestone-2-interview-scheduling-dashboard',
      '3-8-interview-post-commit-events-and-notification-contract.md',
    )

    expect(storyDocument).toContain('Do not run reminder/confirmation orchestration inside transaction scope')
    expect(storyDocument).toContain('Keep reminder/confirmation handling in downstream post-commit notification orchestration')
  })
})