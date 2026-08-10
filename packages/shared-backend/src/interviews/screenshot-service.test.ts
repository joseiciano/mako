import type { Interview, InterviewDetail } from '@mako/shared'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ARTIFACT_STORAGE_CONFIG,
  type ArtifactStoragePort,
  type StoredArtifact,
} from '../interview-assets'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
} from './interview-repository'
import { ScreenshotRepository } from './screenshot-repository'
import { ScreenshotService } from './screenshot-service'
import {
  InterviewBusinessRuleError,
  InterviewConflictError,
  InterviewNotFoundError,
  type InterviewSession,
} from './types'

const schedulerSession: InterviewSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'scheduler@mako.dev',
}

const strangerSession: InterviewSession = {
  userId: '99999999-9999-4999-8999-999999999999',
  email: 'stranger@mako.dev',
}

const interviewId = '33333333-3333-4333-8333-333333333333'

const pngBody = new TextEncoder().encode('fake png bytes').buffer as ArrayBuffer

describe('ScreenshotService', function screenshotServiceSuite() {
  it('uploads a screenshot and returns the stable capture id', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    screenshotRepository.insertScreenshot.mockResolvedValue({
      outcome: 'inserted',
      row: createScreenshotRow(),
    })
    const storagePort = createMockStoragePort()
    storagePort.storeScreenshot.mockResolvedValue(createStoredArtifact())

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'ongoing' }),
    ])

    const result = await service.uploadScreenshot(schedulerSession, {
      interview_id: interviewId,
      idempotency_key: 'idem-key-1',
      content_type: 'image/png',
      capture_timestamp: '2026-04-13T10:00:00.000Z',
      body: pngBody,
    })

    expect(result).toEqual({ capture_id: '44444444-4444-4444-8444-444444444444' })
    expect(screenshotRepository.insertScreenshot).toHaveBeenCalledWith({
      id: '44444444-4444-4444-8444-444444444444',
      interview_id: interviewId,
      object_key: `interviews/${interviewId}/screenshots/44444444-4444-4444-8444-444444444444`,
      idempotency_key: 'idem-key-1',
      content_type: 'image/png',
      content_size_bytes: pngBody.byteLength,
      capture_timestamp: '2026-04-13T10:00:00.000Z',
      created_at: '2026-04-13T10:00:00.000Z',
      updated_at: '2026-04-13T10:00:00.000Z',
      max_screenshots: 10,
    })
    expect(storagePort.storeScreenshot).toHaveBeenCalledTimes(1)
  })

  it('rejects uploads from users who are not participants', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    const storagePort = createMockStoragePort()

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'ongoing' }),
    ])

    await expect(
      service.uploadScreenshot(strangerSession, {
        interview_id: interviewId,
        idempotency_key: 'idem-key-1',
        content_type: 'image/png',
        capture_timestamp: '2026-04-13T10:00:00.000Z',
        body: pngBody,
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError)
    expect(storagePort.storeScreenshot).not.toHaveBeenCalled()
  })

  it('rejects uploads for interviews that are not ongoing', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    const storagePort = createMockStoragePort()

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'scheduled' }),
    ])

    await expect(
      service.uploadScreenshot(schedulerSession, {
        interview_id: interviewId,
        idempotency_key: 'idem-key-1',
        content_type: 'image/png',
        capture_timestamp: '2026-04-13T10:00:00.000Z',
        body: pngBody,
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
    expect(storagePort.storeScreenshot).not.toHaveBeenCalled()
  })

  it('rejects uploads for finalized interviews', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    const storagePort = createMockStoragePort()

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({
        id: interviewId,
        status: 'ongoing',
        screenshots_finalized_at: '2026-04-13T10:30:00.000Z',
      }),
    ])

    await expect(
      service.uploadScreenshot(schedulerSession, {
        interview_id: interviewId,
        idempotency_key: 'idem-key-1',
        content_type: 'image/png',
        capture_timestamp: '2026-04-13T10:00:00.000Z',
        body: pngBody,
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
    expect(storagePort.storeScreenshot).not.toHaveBeenCalled()
  })

  it('rejects unsupported content types', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    const storagePort = createMockStoragePort()

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'ongoing' }),
    ])

    await expect(
      service.uploadScreenshot(schedulerSession, {
        interview_id: interviewId,
        idempotency_key: 'idem-key-1',
        content_type: 'image/jpeg',
        capture_timestamp: '2026-04-13T10:00:00.000Z',
        body: pngBody,
      }),
    ).rejects.toMatchObject({ name: 'ArtifactValidationError' })
    expect(storagePort.storeScreenshot).not.toHaveBeenCalled()
  })

  it('rejects bodies that exceed the configured size limit', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    const storagePort = createMockStoragePort()

    const { service } = createScreenshotService(
      screenshotRepository,
      storagePort,
      [createInterviewRecord({ id: interviewId, status: 'ongoing' })],
      { ...DEFAULT_ARTIFACT_STORAGE_CONFIG, maxScreenshotBytes: 4 },
    )

    await expect(
      service.uploadScreenshot(schedulerSession, {
        interview_id: interviewId,
        idempotency_key: 'idem-key-1',
        content_type: 'image/png',
        capture_timestamp: '2026-04-13T10:00:00.000Z',
        body: pngBody,
      }),
    ).rejects.toMatchObject({ name: 'ArtifactValidationError' })
    expect(storagePort.storeScreenshot).not.toHaveBeenCalled()
  })

  it('rejects uploads that exceed the per-interview screenshot count limit', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    screenshotRepository.countScreenshots.mockResolvedValue(
      DEFAULT_ARTIFACT_STORAGE_CONFIG.maxScreenshotsPerInterview,
    )
    const storagePort = createMockStoragePort()

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'ongoing' }),
    ])

    await expect(
      service.uploadScreenshot(schedulerSession, {
        interview_id: interviewId,
        idempotency_key: 'idem-key-1',
        content_type: 'image/png',
        capture_timestamp: '2026-04-13T10:00:00.000Z',
        body: pngBody,
      }),
    ).rejects.toBeInstanceOf(InterviewBusinessRuleError)
    expect(storagePort.storeScreenshot).not.toHaveBeenCalled()
  })

  it('returns the original capture id and cleans up the redundant object on idempotent retry', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    screenshotRepository.insertScreenshot.mockResolvedValue({
      outcome: 'duplicate',
      row: createScreenshotRow({ id: '55555555-5555-4555-8555-555555555555' }),
    })
    const storagePort = createMockStoragePort()
    storagePort.storeScreenshot.mockResolvedValue(createStoredArtifact())

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'ongoing' }),
    ])

    const result = await service.uploadScreenshot(schedulerSession, {
      interview_id: interviewId,
      idempotency_key: 'idem-key-1',
      content_type: 'image/png',
      capture_timestamp: '2026-04-13T10:00:00.000Z',
      body: pngBody,
    })

    expect(result).toEqual({ capture_id: '55555555-5555-4555-8555-555555555555' })
    expect(storagePort.deleteArtifact).toHaveBeenCalledWith(
      `interviews/${interviewId}/screenshots/44444444-4444-4444-8444-444444444444`,
    )
  })

  it('throws a conflict error when the interview is finalized between check and insert', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    screenshotRepository.insertScreenshot.mockResolvedValue({
      outcome: 'duplicate',
      row: undefined,
    })
    const storagePort = createMockStoragePort()
    storagePort.storeScreenshot.mockResolvedValue(createStoredArtifact())

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'ongoing' }),
    ])

    await expect(
      service.uploadScreenshot(schedulerSession, {
        interview_id: interviewId,
        idempotency_key: 'idem-key-1',
        content_type: 'image/png',
        capture_timestamp: '2026-04-13T10:00:00.000Z',
        body: pngBody,
      }),
    ).rejects.toBeInstanceOf(InterviewConflictError)
    expect(storagePort.deleteArtifact).toHaveBeenCalledWith(
      `interviews/${interviewId}/screenshots/44444444-4444-4444-8444-444444444444`,
    )
  })

  it('removes the stored object when the artifact row cannot be persisted', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    screenshotRepository.insertScreenshot.mockRejectedValue(
      new Error('database unavailable'),
    )
    const storagePort = createMockStoragePort()
    storagePort.storeScreenshot.mockResolvedValue(createStoredArtifact())

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'ongoing' }),
    ])

    await expect(
      service.uploadScreenshot(schedulerSession, {
        interview_id: interviewId,
        idempotency_key: 'idem-key-1',
        content_type: 'image/png',
        capture_timestamp: '2026-04-13T10:00:00.000Z',
        body: pngBody,
      }),
    ).rejects.toThrow('database unavailable')
    expect(storagePort.deleteArtifact).toHaveBeenCalledWith(
      `interviews/${interviewId}/screenshots/44444444-4444-4444-8444-444444444444`,
    )
  })

  it('does not leak the storage object key in the upload response', async function run() {
    const screenshotRepository = createMockScreenshotRepository()
    screenshotRepository.insertScreenshot.mockResolvedValue({
      outcome: 'inserted',
      row: createScreenshotRow(),
    })
    const storagePort = createMockStoragePort()
    storagePort.storeScreenshot.mockResolvedValue(createStoredArtifact())

    const { service } = createScreenshotService(screenshotRepository, storagePort, [
      createInterviewRecord({ id: interviewId, status: 'ongoing' }),
    ])

    const result = await service.uploadScreenshot(schedulerSession, {
      interview_id: interviewId,
      idempotency_key: 'idem-key-1',
      content_type: 'image/png',
      capture_timestamp: '2026-04-13T10:00:00.000Z',
      body: pngBody,
    })

    expect(Object.keys(result)).toEqual(['capture_id'])
  })
})

function createMockScreenshotRepository() {
  const insertScreenshot = vi.fn<MockInsertScreenshot>()
  const countScreenshots = vi.fn<MockCountScreenshots>()
  const isFinalized = vi.fn<MockIsFinalized>()
  const finalizeScreenshots = vi.fn<MockFinalizeScreenshots>()
  const deleteByKey = vi.fn<MockDeleteByKey>()

  return {
    insertScreenshot,
    countScreenshots,
    isFinalized,
    finalizeScreenshots,
    deleteByKey,
  }
}

type MockInsertScreenshot = (
  input: {
    id: string
    interview_id: string
    object_key: string
    idempotency_key: string
    content_type: string
    content_size_bytes: number
    capture_timestamp: string
    created_at: string
    updated_at: string
    max_screenshots: number
  },
) => Promise<{ outcome: 'inserted' | 'duplicate'; row?: unknown }>

type MockCountScreenshots = (interviewId: string) => Promise<number>

type MockIsFinalized = (interviewId: string) => Promise<boolean>

type MockFinalizeScreenshots = (interviewId: string, timestamp: string) => Promise<boolean>

type MockDeleteByKey = (key: string) => Promise<void>

function createMockStoragePort() {
  const storeScreenshot = vi.fn<MockStoreScreenshot>()
  const deleteArtifact = vi.fn<MockDeleteArtifact>()

  return {
    storeScreenshot,
    deleteArtifact,
  }
}

type MockStoreScreenshot = (input: {
  interviewId: string
  screenshotId: string
  contentType: string
  body: ArrayBuffer
  captureTimestamp: string
}) => Promise<StoredArtifact>

type MockDeleteArtifact = (key: string) => Promise<void>

function createStoredArtifact(): StoredArtifact {
  return {
    key: `interviews/${interviewId}/screenshots/44444444-4444-4444-8444-444444444444`,
    metadata: {
      interviewId,
      artifactKind: 'screenshot',
      contentType: 'image/png',
      captureTimestamp: '2026-04-13T10:00:00.000Z',
    },
  }
}

function createScreenshotService(
  screenshotRepository: ReturnType<typeof createMockScreenshotRepository>,
  storagePort: ReturnType<typeof createMockStoragePort>,
  seedInterviews: readonly Interview[],
  config = DEFAULT_ARTIFACT_STORAGE_CONFIG,
): { service: ScreenshotService } {
  const interviewRepository = new InterviewRepository(
    createInMemoryInterviewDataSource(
      [
        {
          userId: schedulerSession.userId,
          credits: 0,
          freeStandardInterviews: 1,
          freeAiInterviews: 0,
        },
      ],
      seedInterviews,
    ),
  )

  return {
    service: new ScreenshotService(
      screenshotRepository as unknown as ScreenshotRepository,
      interviewRepository,
      storagePort as unknown as ArtifactStoragePort,
      config,
      function createId() {
        return '44444444-4444-4444-8444-444444444444'
      },
      function now() {
        return '2026-04-13T10:00:00.000Z'
      },
    ),
  }
}

function createInterviewRecord(
  overrides: Partial<Interview & InterviewDetail> = {},
): Interview & InterviewDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: schedulerSession.userId,
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'ongoing',
    scheduled_at: '2026-04-13T10:00:00.000Z',
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'not_started',
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    transcript: null,
    screenshots_finalized_at: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
    ...overrides,
  }
}

function createScreenshotRow(
  overrides: { id?: string } = {},
): { id: string } {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    ...overrides,
  }
}
