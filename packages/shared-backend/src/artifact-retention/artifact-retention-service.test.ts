import { describe, expect, it, vi } from 'vitest'
import type { ArtifactStoragePort } from '../interview-assets'
import { ArtifactRetentionRepository } from './artifact-retention-repository'
import { ArtifactRetentionService } from './artifact-retention-service'
import type { RetentionArtifactRow } from './types'

const interviewIdA = '22222222-2222-4222-8222-222222222222'
const interviewIdB = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'

function createMockRepository() {
  return {
    listExpiredArtifacts: vi.fn<ArtifactRetentionRepository['listExpiredArtifacts']>(),
    clearArtifactObjectKey: vi.fn<ArtifactRetentionRepository['clearArtifactObjectKey']>(),
    listParticipantInterviewIds: vi.fn<ArtifactRetentionRepository['listParticipantInterviewIds']>(),
    listArtifactsForInterviews: vi.fn<ArtifactRetentionRepository['listArtifactsForInterviews']>(),
    clearInterviewPrivacyFields: vi.fn<ArtifactRetentionRepository['clearInterviewPrivacyFields']>(),
  }
}

function createMockStoragePort() {
  return {
    headArtifact: vi.fn<ArtifactStoragePort['headArtifact']>(),
    deleteArtifact: vi.fn<ArtifactStoragePort['deleteArtifact']>(),
  } as unknown as ArtifactStoragePort & {
    headArtifact: ReturnType<typeof vi.fn>
    deleteArtifact: ReturnType<typeof vi.fn>
  }
}

function recordingRow(overrides: Partial<RetentionArtifactRow> = {}): RetentionArtifactRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    interview_id: interviewIdA,
    artifact_kind: 'playback_recording',
    object_key: `interviews/${interviewIdA}/recording/11111111-1111-4111-8111-111111111111`,
    ...overrides,
  }
}

function screenshotRow(overrides: Partial<RetentionArtifactRow> = {}): RetentionArtifactRow {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    interview_id: interviewIdA,
    artifact_kind: 'screenshot',
    object_key: `interviews/${interviewIdA}/screenshots/55555555-5555-4555-8555-555555555555`,
    ...overrides,
  }
}

describe('ArtifactRetentionService', function suite() {
  describe('runScheduledRetentionSweep', function sweepSuite() {
    it('deletes expired objects, clears their rows, and reports counters', async function run() {
      const repository = createMockRepository()
      const rows = [recordingRow(), screenshotRow()]
      repository.listExpiredArtifacts.mockResolvedValue(rows)
      repository.clearArtifactObjectKey.mockResolvedValue(true)

      const storagePort = createMockStoragePort()
      storagePort.headArtifact.mockResolvedValue({ size: 10, contentType: 'video/webm' })

      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        storagePort,
        () => '2026-06-01T00:00:00.000Z',
      )

      const counters = await service.runScheduledRetentionSweep(50)

      expect(repository.listExpiredArtifacts).toHaveBeenCalledWith(50, '2026-06-01T00:00:00.000Z')
      expect(storagePort.deleteArtifact).toHaveBeenCalledWith(rows[0]!.object_key)
      expect(storagePort.deleteArtifact).toHaveBeenCalledWith(rows[1]!.object_key)
      expect(repository.clearArtifactObjectKey).toHaveBeenCalledWith(rows[0]!.id, '2026-06-01T00:00:00.000Z')
      expect(repository.clearArtifactObjectKey).toHaveBeenCalledWith(rows[1]!.id, '2026-06-01T00:00:00.000Z')

      expect(counters).toEqual({
        scannedInterviews: 1,
        scannedArtifacts: 2,
        recordingDeletions: 1,
        screenshotDeletions: 1,
        alreadyMissingObjects: 0,
        failures: 0,
        clearedRows: 2,
      })
    })

    it('only selects rows whose expiry has passed (repository enforces the cutoff)', async function run() {
      const repository = createMockRepository()
      repository.listExpiredArtifacts.mockResolvedValue([])
      const storagePort = createMockStoragePort()

      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        storagePort,
        () => '2026-06-01T00:00:00.000Z',
      )

      const counters = await service.runScheduledRetentionSweep(50)

      expect(counters.scannedArtifacts).toBe(0)
      expect(storagePort.deleteArtifact).not.toHaveBeenCalled()
      expect(repository.clearArtifactObjectKey).not.toHaveBeenCalled()
    })

    it('passes the configured batch limit through to the bounded query', async function run() {
      const repository = createMockRepository()
      repository.listExpiredArtifacts.mockResolvedValue([])
      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        createMockStoragePort(),
        () => '2026-06-01T00:00:00.000Z',
      )

      await service.runScheduledRetentionSweep(7)

      expect(repository.listExpiredArtifacts).toHaveBeenCalledWith(7, '2026-06-01T00:00:00.000Z')
    })

    it('treats an object already removed by the R2 lifecycle rule as idempotent success', async function run() {
      const repository = createMockRepository()
      const row = recordingRow()
      repository.listExpiredArtifacts.mockResolvedValue([row])
      repository.clearArtifactObjectKey.mockResolvedValue(true)

      const storagePort = createMockStoragePort()
      storagePort.headArtifact.mockResolvedValue(null)

      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        storagePort,
        () => '2026-06-01T00:00:00.000Z',
      )

      const counters = await service.runScheduledRetentionSweep(50)

      expect(storagePort.deleteArtifact).not.toHaveBeenCalled()
      expect(repository.clearArtifactObjectKey).toHaveBeenCalledWith(row.id, '2026-06-01T00:00:00.000Z')
      expect(counters.alreadyMissingObjects).toBe(1)
      expect(counters.clearedRows).toBe(1)
      expect(counters.recordingDeletions).toBe(0)
    })

    it('isolates one failed object so it does not block the rest of the batch', async function run() {
      const repository = createMockRepository()
      const failingRow = recordingRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      const okRow = screenshotRow()
      repository.listExpiredArtifacts.mockResolvedValue([failingRow, okRow])
      repository.clearArtifactObjectKey.mockResolvedValue(true)

      const storagePort = createMockStoragePort()
      storagePort.headArtifact.mockImplementation(async (key: string) => {
        if (key === failingRow.object_key) {
          throw new Error('R2 unavailable')
        }
        return { size: 10, contentType: 'image/png' }
      })

      const logger = { error: vi.fn() }
      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        storagePort,
        () => '2026-06-01T00:00:00.000Z',
        logger,
      )

      const counters = await service.runScheduledRetentionSweep(50)

      expect(counters.failures).toBe(1)
      // The failing row's object key/content is never logged.
      expect(logger.error).toHaveBeenCalledTimes(1)
      const [, context] = logger.error.mock.calls[0]!
      expect(JSON.stringify(context)).not.toContain(failingRow.object_key)
      expect(JSON.stringify(context)).not.toContain(failingRow.id)

      // The second (healthy) row is still processed and cleared.
      expect(storagePort.deleteArtifact).toHaveBeenCalledWith(okRow.object_key)
      expect(repository.clearArtifactObjectKey).toHaveBeenCalledWith(okRow.id, '2026-06-01T00:00:00.000Z')
      expect(counters.clearedRows).toBe(1)
      expect(counters.screenshotDeletions).toBe(1)

      // The failed row was never cleared, so a later run retries it.
      expect(repository.clearArtifactObjectKey).not.toHaveBeenCalledWith(
        failingRow.id,
        expect.anything(),
      )
    })

    it('treats a retry-safe no-op clear as not newly cleared', async function run() {
      const repository = createMockRepository()
      const row = recordingRow()
      repository.listExpiredArtifacts.mockResolvedValue([row])
      repository.clearArtifactObjectKey.mockResolvedValue(false)

      const storagePort = createMockStoragePort()
      storagePort.headArtifact.mockResolvedValue({ size: 10, contentType: 'video/webm' })

      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        storagePort,
        () => '2026-06-01T00:00:00.000Z',
      )

      const counters = await service.runScheduledRetentionSweep(50)

      expect(counters.clearedRows).toBe(0)
      expect(counters.recordingDeletions).toBe(1)
    })
  })

  describe('runPrivacyCleanupForUser', function privacyCleanupSuite() {
    it('removes raw artifacts and clears transcript/feedback for every participant interview', async function run() {
      const repository = createMockRepository()
      repository.listParticipantInterviewIds.mockResolvedValue([interviewIdA, interviewIdB])
      const rows = [
        recordingRow({ interview_id: interviewIdA }),
        screenshotRow({ interview_id: interviewIdB }),
      ]
      repository.listArtifactsForInterviews.mockResolvedValue(rows)
      repository.clearArtifactObjectKey.mockResolvedValue(true)
      repository.clearInterviewPrivacyFields.mockResolvedValue(undefined)

      const storagePort = createMockStoragePort()
      storagePort.headArtifact.mockResolvedValue({ size: 10, contentType: 'video/webm' })

      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        storagePort,
        () => '2026-06-01T00:00:00.000Z',
      )

      const counters = await service.runPrivacyCleanupForUser(userId)

      expect(repository.listParticipantInterviewIds).toHaveBeenCalledWith(userId)
      expect(repository.listArtifactsForInterviews).toHaveBeenCalledWith([interviewIdA, interviewIdB])
      expect(repository.clearInterviewPrivacyFields).toHaveBeenCalledWith(interviewIdA, '2026-06-01T00:00:00.000Z')
      expect(repository.clearInterviewPrivacyFields).toHaveBeenCalledWith(interviewIdB, '2026-06-01T00:00:00.000Z')

      expect(counters).toEqual({
        scannedInterviews: 2,
        scannedArtifacts: 2,
        recordingDeletions: 1,
        screenshotDeletions: 1,
        alreadyMissingObjects: 0,
        failures: 0,
        clearedRows: 2,
      })
    })

    it('removes artifacts regardless of expiry (not just expired ones)', async function run() {
      const repository = createMockRepository()
      repository.listParticipantInterviewIds.mockResolvedValue([interviewIdA])
      repository.listArtifactsForInterviews.mockResolvedValue([recordingRow()])
      repository.clearArtifactObjectKey.mockResolvedValue(true)
      repository.clearInterviewPrivacyFields.mockResolvedValue(undefined)

      const storagePort = createMockStoragePort()
      storagePort.headArtifact.mockResolvedValue({ size: 10, contentType: 'video/webm' })

      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        storagePort,
        () => '2026-06-01T00:00:00.000Z',
      )

      await service.runPrivacyCleanupForUser(userId)

      // listArtifactsForInterviews (not listExpiredArtifacts) is the
      // privacy-cleanup query path, so expiry is never consulted.
      expect(repository.listArtifactsForInterviews).toHaveBeenCalledTimes(1)
    })

    it('is a no-op with zero counters when the user has no participant interviews', async function run() {
      const repository = createMockRepository()
      repository.listParticipantInterviewIds.mockResolvedValue([])

      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        createMockStoragePort(),
        () => '2026-06-01T00:00:00.000Z',
      )

      const counters = await service.runPrivacyCleanupForUser(userId)

      expect(repository.listArtifactsForInterviews).not.toHaveBeenCalled()
      expect(counters).toEqual({
        scannedInterviews: 0,
        scannedArtifacts: 0,
        recordingDeletions: 0,
        screenshotDeletions: 0,
        alreadyMissingObjects: 0,
        failures: 0,
        clearedRows: 0,
      })
    })

    it('counts a failure and keeps going when clearing an interview privacy fields fails', async function run() {
      const repository = createMockRepository()
      repository.listParticipantInterviewIds.mockResolvedValue([interviewIdA, interviewIdB])
      repository.listArtifactsForInterviews.mockResolvedValue([])
      repository.clearInterviewPrivacyFields.mockImplementation(async (interviewId: string) => {
        if (interviewId === interviewIdA) {
          throw new Error('database unavailable')
        }
      })

      const service = new ArtifactRetentionService(
        repository as unknown as ArtifactRetentionRepository,
        createMockStoragePort(),
        () => '2026-06-01T00:00:00.000Z',
        { error: vi.fn() },
      )

      const counters = await service.runPrivacyCleanupForUser(userId)

      expect(counters.failures).toBe(1)
      expect(repository.clearInterviewPrivacyFields).toHaveBeenCalledWith(interviewIdB, '2026-06-01T00:00:00.000Z')
    })
  })
})
