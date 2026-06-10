import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

const storyDocument = readRepositoryFile(
  'docs',
  'product',
  'stories',
  'stories',
  'milestone-2-interview-scheduling-dashboard',
  '4-6-notification-integration-tests-and-drift-gates.md',
)

describe('story 4.6 notification integration tests and drift gates', function () {
  it('keeps Story 4.6 marked completed with no unchecked items and required references', function () {
    const requiredReferences = [
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-1-notification-scope-and-lifecycle-boundary-lock.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-4-confirmation-and-reminder-workflow-rules.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-5-cancellation-reminder-suppression-rules.md',
      'docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/1-5-post-commit-events-and-lifecycle-boundaries.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-2-interview-create-mode-tier-policy-matrix.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-8-interview-post-commit-events-and-notification-contract.md',
      'docs/product/stories/milestones.md',
    ]

    for (const requiredReference of requiredReferences) {
      expect(storyDocument).toContain(requiredReference)
    }

    expect(storyDocument).toContain('**Status**: Completed')
    expect(storyDocument).not.toMatch(/- \[ \]/)
  })

  it('locks create/cancel/matcher event type coverage', function () {
    expect(storyDocument).toContain('interview.created')
    expect(storyDocument).toContain('interview.cancelled')
    expect(storyDocument).toContain('interview.match.created')
    expect(storyDocument).toContain('CRUD create -> `interview.created`')
    expect(storyDocument).toContain('CRUD cancel -> `interview.cancelled`')
    expect(storyDocument).toContain('matcher write -> `interview.match.created`')
  })

  it('locks emit-after-commit behavior and no emission on rollback/failure', function () {
    expect(storyDocument).toContain('emit-after-commit behavior')
    expect(storyDocument).toContain('no emission on transaction rollback/failure paths')
  })

  it('locks deterministic idempotency key and duplicate/replayed delivery idempotency', function () {
    expect(storyDocument).toContain('deterministic `idempotency_key`')
    expect(storyDocument).toContain('duplicate/replayed delivery of the same emitted cancel event remains idempotent')
  })

  it('locks reminder 30-minute lead, suppression rules, and cancellation reminder suppression', function () {
    expect(storyDocument).toContain('reminder scheduling at 30-minute lead')
    expect(storyDocument).toContain('suppression for past-due and <30-minute windows')
    expect(storyDocument).toContain('cancellation suppresses/cancels pending reminders')
  })
})
