import { describe, expect, it, vi } from 'vitest'
import { workDueTransportMessageSchema } from './notification-transport-message'
import { processWorkDue, sendWorkDue } from './work-due'

const interviewId = '33333333-3333-4333-8333-333333333333'
const now = Date.parse('2026-05-22T10:00:00.000Z')

function message(duty: string, dueAtMs: number) {
  return {
    message_type: 'work.due',
    idempotency_key: `${duty}:${interviewId}:${dueAtMs}`,
    duty,
    entity_id: interviewId,
    due_at: new Date(dueAtMs).toISOString(),
  }
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    recordingStop: {
      closeOverdueRecordingsForInterview: vi.fn(async () => ({ outcome: 'resolved' as const })),
    },
    recordingStart: {
      ensureRecordingStarted: vi.fn(async () => 'already_started' as const),
    },
    feedback: {
      isFeedbackTriggered: vi.fn(async () => true),
      triggerFeedback: vi.fn(async () => {}),
      recoverStaleFeedback: vi.fn(async () => ({ outcome: 'resolved' as const })),
    },
    transport: { send: vi.fn(async () => {}) },
    now: () => now,
    maxAgeSeconds: 3600,
    logger: { error: vi.fn() },
    ...overrides,
  }
}

describe('workDueTransportMessageSchema', () => {
  it('accepts the feedback duties', () => {
    expect(workDueTransportMessageSchema.parse(message('feedback_deadline', now)).duty).toBe(
      'feedback_deadline',
    )
    expect(workDueTransportMessageSchema.parse(message('feedback_stale', now)).duty).toBe(
      'feedback_stale',
    )
  })

  it('accepts both duties', () => {
    expect(workDueTransportMessageSchema.parse(message('recording_overdue', now)).duty).toBe(
      'recording_overdue',
    )
    expect(workDueTransportMessageSchema.parse(message('start_claim_stale', now)).duty).toBe(
      'start_claim_stale',
    )
  })

  it('rejects an unknown duty', () => {
    expect(workDueTransportMessageSchema.safeParse(message('reminder', now)).success).toBe(false)
  })
})

describe('sendWorkDue', () => {
  it('sends with the remaining delay', async () => {
    const d = deps()
    await sendWorkDue(d.transport, d.logger, {
      duty: 'recording_overdue',
      entityId: interviewId,
      dueAtMs: now + 3_600_000,
      nowMs: now,
    })
    expect(d.transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ message_type: 'work.due', duty: 'recording_overdue', entity_id: interviewId }),
      { delaySeconds: 3600 },
    )
  })

  it('does not throw when the send fails', async () => {
    const d = deps({ transport: { send: vi.fn(async () => { throw new Error('queue down') }) } })
    await expect(
      sendWorkDue(d.transport, d.logger, {
        duty: 'start_claim_stale',
        entityId: interviewId,
        dueAtMs: now + 60_000,
        nowMs: now,
      }),
    ).resolves.toBeUndefined()
    expect(d.logger.error).toHaveBeenCalled()
  })

  it('does nothing when no transport is configured', async () => {
    await expect(
      sendWorkDue(undefined, { error() {} }, {
        duty: 'start_claim_stale',
        entityId: interviewId,
        dueAtMs: now,
        nowMs: now,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('processWorkDue recording_overdue', () => {
  const msg = workDueTransportMessageSchema.parse(message('recording_overdue', now))

  it('is a no-op for resolved work', async () => {
    const d = deps()
    await processWorkDue(msg, d)
    expect(d.transport.send).not.toHaveBeenCalled()
  })

  it('closes open overdue work with the configured max age', async () => {
    const d = deps()
    d.recordingStop.closeOverdueRecordingsForInterview.mockResolvedValue({ outcome: 'closed' } as never)
    await processWorkDue(msg, d)
    expect(d.recordingStop.closeOverdueRecordingsForInterview).toHaveBeenCalledWith({
      interviewId,
      maxAgeSeconds: 3600,
    })
    expect(d.transport.send).not.toHaveBeenCalled()
  })

  it('re-sends an early message with the remaining delay', async () => {
    const d = deps()
    d.recordingStop.closeOverdueRecordingsForInterview.mockResolvedValue({
      outcome: 'early',
      dueAtMs: now + 90_000,
    } as never)
    await processWorkDue(msg, d)
    expect(d.transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ duty: 'recording_overdue', entity_id: interviewId }),
      { delaySeconds: 90 },
    )
  })

  it('throws when a stop failed so the queue retries', async () => {
    const d = deps()
    d.recordingStop.closeOverdueRecordingsForInterview.mockResolvedValue({ outcome: 'failed' } as never)
    await expect(processWorkDue(msg, d)).rejects.toThrow('recording_overdue_stop_failed')
  })
})

describe('processWorkDue start_claim_stale', () => {
  it('calls ensureRecordingStarted for a due message and does not re-send', async () => {
    const d = deps()
    d.recordingStart.ensureRecordingStarted.mockResolvedValue('in_progress' as never)
    await processWorkDue(workDueTransportMessageSchema.parse(message('start_claim_stale', now)), d)
    expect(d.recordingStart.ensureRecordingStarted).toHaveBeenCalledWith(interviewId)
    expect(d.transport.send).not.toHaveBeenCalled()
  })

  it('is a no-op for resolved work even when early', async () => {
    const d = deps()
    await processWorkDue(
      workDueTransportMessageSchema.parse(message('start_claim_stale', now + 30_000)),
      d,
    )
    expect(d.transport.send).not.toHaveBeenCalled()
  })

  it('re-sends an early message while the claim is still open', async () => {
    const d = deps()
    d.recordingStart.ensureRecordingStarted.mockResolvedValue('in_progress' as never)
    await processWorkDue(
      workDueTransportMessageSchema.parse(message('start_claim_stale', now + 30_000)),
      d,
    )
    expect(d.transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ duty: 'start_claim_stale' }),
      { delaySeconds: 30 },
    )
  })
})

describe('processWorkDue early re-send failure', () => {
  const failing = () => ({ send: vi.fn(async () => { throw new Error('queue down') }) })

  it('rejects when the overdue re-send fails', async () => {
    const d = deps({ transport: failing() })
    d.recordingStop.closeOverdueRecordingsForInterview.mockResolvedValue({
      outcome: 'early',
      dueAtMs: now + 90_000,
    } as never)
    await expect(
      processWorkDue(workDueTransportMessageSchema.parse(message('recording_overdue', now)), d),
    ).rejects.toThrow('queue down')
  })

  it('rejects when the stale-claim re-send fails', async () => {
    const d = deps({ transport: failing() })
    d.recordingStart.ensureRecordingStarted.mockResolvedValue('in_progress' as never)
    await expect(
      processWorkDue(workDueTransportMessageSchema.parse(message('start_claim_stale', now + 30_000)), d),
    ).rejects.toThrow('queue down')
  })
})

describe('processWorkDue feedback_deadline', () => {
  const due = workDueTransportMessageSchema.parse(message('feedback_deadline', now))
  const early = workDueTransportMessageSchema.parse(message('feedback_deadline', now + 30_000))

  it('is a no-op when the feedback marker is set', async () => {
    const d = deps()
    await processWorkDue(due, d)
    expect(d.feedback.triggerFeedback).not.toHaveBeenCalled()
    expect(d.transport.send).not.toHaveBeenCalled()
  })

  it('starts feedback once at the deadline when the marker is unset', async () => {
    const d = deps()
    d.feedback.isFeedbackTriggered.mockResolvedValue(false)
    await processWorkDue(due, d)
    expect(d.feedback.triggerFeedback).toHaveBeenCalledTimes(1)
    expect(d.feedback.triggerFeedback).toHaveBeenCalledWith(interviewId)
  })

  it('re-sends an early message with the remaining delay when the marker is unset', async () => {
    const d = deps()
    d.feedback.isFeedbackTriggered.mockResolvedValue(false)
    await processWorkDue(early, d)
    expect(d.feedback.triggerFeedback).not.toHaveBeenCalled()
    expect(d.transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ duty: 'feedback_deadline', entity_id: interviewId }),
      { delaySeconds: 30 },
    )
  })

  it('does not re-send an early message when the marker is set', async () => {
    const d = deps()
    await processWorkDue(early, d)
    expect(d.transport.send).not.toHaveBeenCalled()
  })

  it('throws when starting feedback fails so the queue retries', async () => {
    const d = deps()
    d.feedback.isFeedbackTriggered.mockResolvedValue(false)
    d.feedback.triggerFeedback.mockRejectedValue(new Error('workflow down'))
    await expect(processWorkDue(due, d)).rejects.toThrow('workflow down')
  })

  it('throws when the early re-send fails', async () => {
    const d = deps({ transport: { send: vi.fn(async () => { throw new Error('queue down') }) } })
    d.feedback.isFeedbackTriggered.mockResolvedValue(false)
    await expect(processWorkDue(early, d)).rejects.toThrow('queue down')
  })
})

describe('processWorkDue feedback_stale', () => {
  const msg = workDueTransportMessageSchema.parse(message('feedback_stale', now))

  it('is a no-op for resolved work', async () => {
    const d = deps()
    await processWorkDue(msg, d)
    expect(d.feedback.recoverStaleFeedback).toHaveBeenCalledWith(interviewId)
    expect(d.transport.send).not.toHaveBeenCalled()
  })

  it('does not re-send after recovering stale processing', async () => {
    const d = deps()
    d.feedback.recoverStaleFeedback.mockResolvedValue({ outcome: 'recovered' } as never)
    await processWorkDue(msg, d)
    expect(d.transport.send).not.toHaveBeenCalled()
  })

  it('re-sends with the remaining delay when the heartbeat was refreshed', async () => {
    const d = deps()
    d.feedback.recoverStaleFeedback.mockResolvedValue({
      outcome: 'early',
      dueAtMs: now + 600_000,
    } as never)
    await processWorkDue(msg, d)
    expect(d.transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ duty: 'feedback_stale', entity_id: interviewId }),
      { delaySeconds: 600 },
    )
  })

  it('throws when the early re-send fails', async () => {
    const d = deps({ transport: { send: vi.fn(async () => { throw new Error('queue down') }) } })
    d.feedback.recoverStaleFeedback.mockResolvedValue({ outcome: 'early', dueAtMs: now + 600_000 } as never)
    await expect(processWorkDue(msg, d)).rejects.toThrow('queue down')
  })
})
