import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import {
  ScreenshotRepository,
  type ScreenshotArtifactRow,
} from './screenshot-repository'

const interviewId = '33333333-3333-4333-8333-333333333333'
const screenshotId = '44444444-4444-4444-8444-444444444444'

function createMockQueryExecutor(
  handlers: Record<string, (query: SqlQuery) => { rows: unknown[]; rowCount: number }>,
) {
  return {
    async query<Row>(query: SqlQuery) {
      const normalized = query.text.trim().toUpperCase()

      if (
        normalized === 'BEGIN;' ||
        normalized === 'COMMIT;' ||
        normalized === 'ROLLBACK;'
      ) {
        return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
      }

      for (const [key, handler] of Object.entries(handlers)) {
        if (query.text.includes(key)) {
          return handler(query) as { rows: Row[]; rowCount: number }
        }
      }

      throw new Error(`Unexpected query: ${query.text}`)
    },
  }
}

function createScreenshotRow(
  overrides: Partial<ScreenshotArtifactRow> = {},
): ScreenshotArtifactRow {
  return {
    id: screenshotId,
    interview_id: interviewId,
    artifact_kind: 'screenshot',
    object_key: `interviews/${interviewId}/screenshots/${screenshotId}`,
    idempotency_key: 'idem-key-1',
    content_type: 'image/png',
    content_size_bytes: 1024,
    capture_timestamp: '2026-04-13T10:00:00.000Z',
    finalized_at: null,
    expires_at: null,
    deleted_at: null,
    created_at: '2026-04-13T10:00:00.000Z',
    updated_at: '2026-04-13T10:00:00.000Z',
    ...overrides,
  }
}

describe('ScreenshotRepository', function screenshotRepositorySuite() {
  it('insertScreenshot inserts a new artifact row', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'INSERT INTO interview_artifacts': () => ({
        rows: [createScreenshotRow()],
        rowCount: 1,
      }),
    })

    const repository = new ScreenshotRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.insertScreenshot({
      id: screenshotId,
      interview_id: interviewId,
      object_key: `interviews/${interviewId}/screenshots/${screenshotId}`,
      idempotency_key: 'idem-key-1',
      content_type: 'image/png',
      content_size_bytes: 1024,
      capture_timestamp: '2026-04-13T10:00:00.000Z',
      created_at: '2026-04-13T10:00:00.000Z',
      updated_at: '2026-04-13T10:00:00.000Z',
      max_screenshots: 10,
    })

    expect(result.outcome).toBe('inserted')
    expect(result.row).toMatchObject({
      id: screenshotId,
      interview_id: interviewId,
      idempotency_key: 'idem-key-1',
    })
  })

  it('insertScreenshot returns the existing row for a duplicate idempotency key', async function run() {
    const existingRow = createScreenshotRow({
      id: '55555555-5555-4555-8555-555555555555',
    })
    const mockQueryExecutor = createMockQueryExecutor({
      'INSERT INTO interview_artifacts': () => ({ rows: [], rowCount: 0 }),
      'idempotency_key = $2': () => ({ rows: [existingRow], rowCount: 1 }),
    })

    const repository = new ScreenshotRepository({ queryExecutor: mockQueryExecutor })

    const result = await repository.insertScreenshot({
      id: screenshotId,
      interview_id: interviewId,
      object_key: `interviews/${interviewId}/screenshots/${screenshotId}`,
      idempotency_key: 'idem-key-1',
      content_type: 'image/png',
      content_size_bytes: 1024,
      capture_timestamp: '2026-04-13T10:00:00.000Z',
      created_at: '2026-04-13T10:00:00.000Z',
      updated_at: '2026-04-13T10:00:00.000Z',
      max_screenshots: 10,
    })

    expect(result.outcome).toBe('duplicate')
    expect(result.row?.id).toBe('55555555-5555-4555-8555-555555555555')
  })

  it('countScreenshots returns the number of live screenshot artifacts', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'COUNT(*)': () => ({ rows: [{ count: 4 }], rowCount: 1 }),
    })

    const repository = new ScreenshotRepository({ queryExecutor: mockQueryExecutor })

    const count = await repository.countScreenshots(interviewId)

    expect(count).toBe(4)
  })

  it('countScreenshots returns zero when no rows are returned', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'COUNT(*)': () => ({ rows: [], rowCount: 0 }),
    })

    const repository = new ScreenshotRepository({ queryExecutor: mockQueryExecutor })

    const count = await repository.countScreenshots(interviewId)

    expect(count).toBe(0)
  })

  it('isFinalized returns false when screenshots have not been finalized', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'SELECT screenshots_finalized_at': () => ({
        rows: [{ screenshots_finalized_at: null }],
        rowCount: 1,
      }),
    })

    const repository = new ScreenshotRepository({ queryExecutor: mockQueryExecutor })

    const finalized = await repository.isFinalized(interviewId)

    expect(finalized).toBe(false)
  })

  it('isFinalized returns true when screenshots have been finalized', async function run() {
    const mockQueryExecutor = createMockQueryExecutor({
      'SELECT screenshots_finalized_at': () => ({
        rows: [{ screenshots_finalized_at: '2026-04-13T12:00:00.000Z' }],
        rowCount: 1,
      }),
    })

    const repository = new ScreenshotRepository({ queryExecutor: mockQueryExecutor })

    const finalized = await repository.isFinalized(interviewId)

    expect(finalized).toBe(true)
  })

  it('finalizeScreenshots returns true on first call and false on retry', async function run() {
    const firstCall = createMockQueryExecutor({
      'SET screenshots_finalized_at': () => ({
        rows: [{ id: interviewId }],
        rowCount: 1,
      }),
    })
    const retryCall = createMockQueryExecutor({
      'SET screenshots_finalized_at': () => ({ rows: [], rowCount: 0 }),
    })

    const firstRepository = new ScreenshotRepository({ queryExecutor: firstCall })
    const retryRepository = new ScreenshotRepository({ queryExecutor: retryCall })

    const timestamp = '2026-04-13T12:00:00.000Z'
    await expect(firstRepository.finalizeScreenshots(interviewId, timestamp)).resolves.toBe(true)
    await expect(retryRepository.finalizeScreenshots(interviewId, timestamp)).resolves.toBe(false)
  })

  it('deleteByKey removes the artifact row for a given object key', async function run() {
    let deleteRan = false
    const mockQueryExecutor = createMockQueryExecutor({
      'DELETE FROM interview_artifacts': () => {
        deleteRan = true
        return { rows: [], rowCount: 1 }
      },
    })

    const repository = new ScreenshotRepository({ queryExecutor: mockQueryExecutor })

    await repository.deleteByKey(`interviews/${interviewId}/screenshots/${screenshotId}`)

    expect(deleteRan).toBe(true)
  })
})
