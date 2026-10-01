import { describe, expect, it, vi } from 'vitest'
import { FeedbackReplayRepository } from './feedback-replay-repository'
import { FeedbackReplayService } from './feedback-replay-service'

const interviewId = '33333333-3333-4333-8333-333333333333'

function createRepository(overrides: Partial<FeedbackReplayRepository> = {}): FeedbackReplayRepository {
  return {
    getReplayState: vi.fn(),
    resetFailedToPending: vi.fn(),
    insertReplayAudit: vi.fn(),
    ...overrides,
  } as unknown as FeedbackReplayRepository
}

const FIXED_NOW = new Date('2026-09-01T00:00:00.000Z')

describe('FeedbackReplayService', function suite() {
  it('returns not_found when the interview does not exist', async function run() {
    const repository = createRepository({ getReplayState: vi.fn().mockResolvedValue(null) })
    const service = new FeedbackReplayService(repository, () => FIXED_NOW, () => 'audit-1')

    const result = await service.replay({
      interviewId,
      operatorIdentity: 'ops@example.com',
      reason: 'retry',
      targetSchemaVersion: 1,
    })

    expect(result).toEqual({ outcome: 'not_found' })
  })

  it('refuses to replay an already-ready interview', async function run() {
    const repository = createRepository({
      getReplayState: vi.fn().mockResolvedValue({
        feedback_status: 'ready',
        feedback_attempt_id: null,
        feedback_error_code: null,
      }),
    })
    const service = new FeedbackReplayService(repository, () => FIXED_NOW, () => 'audit-1')

    const result = await service.replay({
      interviewId,
      operatorIdentity: 'ops@example.com',
      reason: 'curiosity',
      targetSchemaVersion: 1,
    })

    expect(result).toEqual({ outcome: 'already_ready' })
    expect(repository.resetFailedToPending).not.toHaveBeenCalled()
    expect(repository.insertReplayAudit).not.toHaveBeenCalled()
  })

  it('refuses to replay an interview that is not failed (e.g. still processing)', async function run() {
    const repository = createRepository({
      getReplayState: vi.fn().mockResolvedValue({
        feedback_status: 'processing',
        feedback_attempt_id: 'attempt-1',
        feedback_error_code: null,
      }),
    })
    const service = new FeedbackReplayService(repository, () => FIXED_NOW, () => 'audit-1')

    const result = await service.replay({
      interviewId,
      operatorIdentity: 'ops@example.com',
      reason: 'impatient',
      targetSchemaVersion: 1,
    })

    expect(result).toEqual({ outcome: 'not_failed' })
    expect(repository.resetFailedToPending).not.toHaveBeenCalled()
  })

  it('resets a failed interview, writes the audit row, and returns a uniquely suffixed instance id', async function run() {
    const repository = createRepository({
      getReplayState: vi.fn().mockResolvedValue({
        feedback_status: 'failed',
        feedback_attempt_id: 'attempt-1',
        feedback_error_code: 'analysis_failed',
      }),
      resetFailedToPending: vi.fn().mockResolvedValue(true),
      insertReplayAudit: vi.fn().mockResolvedValue(undefined),
    })
    const service = new FeedbackReplayService(repository, () => FIXED_NOW, () => 'audit-1')

    const result = await service.replay({
      interviewId,
      operatorIdentity: 'ops@example.com',
      reason: 'provider outage resolved',
      targetSchemaVersion: 1,
    })

    expect(result).toEqual({
      outcome: 'replayed',
      auditId: 'audit-1',
      newWorkflowInstanceId: `feedback-v1-${interviewId}-replay-${FIXED_NOW.getTime()}`,
    })
    expect(repository.resetFailedToPending).toHaveBeenCalledWith(interviewId)
    expect(repository.insertReplayAudit).toHaveBeenCalledWith({
      id: 'audit-1',
      interviewId,
      priorAttemptId: 'attempt-1',
      priorErrorCode: 'analysis_failed',
      targetSchemaVersion: 1,
      operatorIdentity: 'ops@example.com',
      reason: 'provider outage resolved',
      createdAt: FIXED_NOW.toISOString(),
    })
  })

  it('returns not_failed when the reset loses a race (already reset concurrently)', async function run() {
    const repository = createRepository({
      getReplayState: vi.fn().mockResolvedValue({
        feedback_status: 'failed',
        feedback_attempt_id: 'attempt-1',
        feedback_error_code: 'transcription_failed',
      }),
      resetFailedToPending: vi.fn().mockResolvedValue(false),
    })
    const service = new FeedbackReplayService(repository, () => FIXED_NOW, () => 'audit-1')

    const result = await service.replay({
      interviewId,
      operatorIdentity: 'ops@example.com',
      reason: 'retry',
      targetSchemaVersion: 1,
    })

    expect(result).toEqual({ outcome: 'not_failed' })
    expect(repository.insertReplayAudit).not.toHaveBeenCalled()
  })
})
