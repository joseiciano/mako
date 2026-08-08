import { describe, expect, it } from 'vitest'
import { InterviewService } from '../interviews/interview-service'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
  type InterviewRepositoryDataSource,
} from '../interviews/interview-repository'
import { NotificationService } from './notification-service'
import { NotificationRepository } from './notification-repository'
import { NotificationDispatchService } from './notification-dispatch-service'
import { NotificationConsumerService } from './notification-consumer-service'
import { MatcherExecutionService } from '../matcher/matcher-execution-service'
import type { MatcherCandidateRow } from '../matcher/types'
import type { Interview, InterviewDetail } from '@mako/shared'
import type { InterviewSession } from '../interviews/types'
import type {
  NotificationOutboxEventRow,
  NotificationReminderScheduleRow,
  InterviewState,
} from './notification-types'
import type { NotificationTransport, NotificationTransportMessage } from './notification-transport-message'
import type { NotificationQueueEvent } from '../notification-queue-event-contract'
import type { NotificationDeliveryPort } from './notification-consumer-service'

const activeSession: InterviewSession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

const interviewerSession: InterviewSession = {
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'interviewer@mako.dev',
}

describe('Notification Integration', function notificationIntegrationSuite() {
  it('create interview emits interview.created with nullable interviewer, mirrored identities, confirmation and reminder schedule', async function run() {
    const harness = createIntegrationHarness({ freeAiInterviews: 1, credits: 0 })
    const scheduledAt = '2026-05-22T14:00:00.000Z'

    const response = await harness.interviewService.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: scheduledAt,
    })

    const interviewId = response.interview.id

    // Outbox event persisted
    expect(harness.outboxEvents).toHaveLength(1)
    const outboxEvent = harness.outboxEvents[0]
    expect(outboxEvent?.event_type).toBe('interview.created')
    expect(outboxEvent?.status).toBe('dispatched')

    // Event payload mirrors persisted shape
    const payload = outboxEvent?.event_payload as Record<string, unknown>
    expect(payload.interview).toMatchObject({
      id: interviewId,
      scheduler_id: activeSession.userId,
      interviewer_id: null,
      mode: 'ai_led',
      status: 'scheduled',
      scheduled_at: scheduledAt,
    })

    // Canonical identity mirrors
    expect(payload.participants).toEqual({
      scheduler_user_id: activeSession.userId,
      interviewer_user_id: null,
    })

    // Dispatch sends transport message
    expect(harness.transportMessages).toHaveLength(1)
    expect(harness.transportMessages[0]).toMatchObject({
      event_type: 'interview.created',
      interview: { id: interviewId },
    })

    // Outbox marked dispatched
    expect(harness.outboxEvents[0]?.status).toBe('dispatched')

    // Consumer processes event: confirmation + reminder schedule
    const createdEvent = payload as unknown as import('../notification-queue-event-contract').InterviewCreatedEvent
    await harness.consumer.processInterviewCreated(createdEvent)

    // Confirmation delivered
    expect(harness.deliveryCalls).toHaveLength(1)
    expect(harness.deliveryCalls[0]).toEqual({
      kind: 'confirmation',
      interviewId,
      scheduledAt,
      recipientUserIds: [activeSession.userId],
      idempotencyKey: `interview.created:${interviewId}/confirmation`,
    })

    // Reminder scheduled at 30-minute lead
    expect(harness.reminderSchedules).toHaveLength(1)
    expect(harness.reminderSchedules[0]?.interview_id).toBe(interviewId)
    expect(harness.reminderSchedules[0]?.reminder_due_at).toBe('2026-05-22T13:30:00.000Z')
    expect(harness.reminderSchedules[0]?.status).toBe('pending')
  })

  it('cancel scheduled interview emits interview.cancelled once, with mirrored payload, and suppresses reminders on replay', async function run() {
    const harness = createIntegrationHarness({ freeAiInterviews: 1, credits: 0 })
    const scheduledAt = '2026-05-22T14:00:00.000Z'

    const createResponse = await harness.interviewService.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: scheduledAt,
    })
    const interviewId = createResponse.interview.id

    // Process created event to set up reminder schedule
    const createdEvent = harness.outboxEvents[0]?.event_payload as unknown as import('../notification-queue-event-contract').InterviewCreatedEvent
    await harness.consumer.processInterviewCreated(createdEvent)
    expect(harness.reminderSchedules).toHaveLength(1)

    // Clear tracking for cancel assertions
    harness.transportMessages.length = 0
    harness.deliveryCalls.length = 0

    // First cancel succeeds and emits event
    const cancelResult = await harness.interviewService.cancelInterview(activeSession, { id: interviewId })
    expect(cancelResult).toEqual({ success: true })

    expect(harness.outboxEvents).toHaveLength(2)
    const cancelOutbox = harness.outboxEvents[1]
    expect(cancelOutbox?.event_type).toBe('interview.cancelled')
    expect(cancelOutbox?.status).toBe('dispatched')

    // Payload mirrors persisted cancelled shape (AI-led, null interviewer)
    const cancelPayload = cancelOutbox?.event_payload as Record<string, unknown>
    expect(cancelPayload.interview).toMatchObject({
      id: interviewId,
      scheduler_id: activeSession.userId,
      interviewer_id: null,
      mode: 'ai_led',
      status: 'cancelled',
    })
    expect(cancelPayload.participants).toEqual({
      scheduler_user_id: activeSession.userId,
      interviewer_user_id: null,
    })

    // Transport dispatched
    expect(harness.transportMessages).toHaveLength(1)
    expect(harness.transportMessages[0]).toMatchObject({
      event_type: 'interview.cancelled',
      interview: { id: interviewId, status: 'cancelled' },
    })

    // Consumer suppresses reminders
    const cancelledEvent = cancelPayload as unknown as import('../notification-queue-event-contract').InterviewCancelledEvent
    await harness.consumer.processInterviewCancelled(cancelledEvent)
    expect(harness.reminderSchedules[0]?.status).toBe('suppressed')

    // Retry cancel emits no new event
    harness.transportMessages.length = 0
    const retryCancelResult = await harness.interviewService.cancelInterview(activeSession, { id: interviewId })
    expect(retryCancelResult).toEqual({ success: true })
    expect(harness.outboxEvents).toHaveLength(2)
    expect(harness.transportMessages).toHaveLength(0)

    // Downstream replay remains idempotent: reminders stay suppressed, checkpoint stable
    harness.deliveryCalls.length = 0
    await harness.consumer.processInterviewCancelled(cancelledEvent)
    expect(harness.reminderSchedules[0]?.status).toBe('suppressed')
    expect(harness.deliveryCalls).toHaveLength(0)
  })

  it('cancel peer-to-peer interview emits interview.cancelled with non-null interviewer and mirrored payload', async function run() {
    const interviewId = '44444444-4444-4444-8444-444444444444'
    const scheduledAt = '2026-05-22T14:00:00.000Z'
    const harness = createIntegrationHarness(
      { freeAiInterviews: 0, credits: 0 },
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          interviewer_id: interviewerSession.userId,
          mode: 'peer_to_peer',
          scheduled_at: scheduledAt,
        }),
      ],
    )

    await harness.interviewService.cancelInterview(activeSession, { id: interviewId })

    expect(harness.outboxEvents).toHaveLength(1)
    const cancelPayload = harness.outboxEvents[0]?.event_payload as Record<string, unknown>
    expect(cancelPayload.interview).toMatchObject({
      id: interviewId,
      scheduler_id: activeSession.userId,
      interviewer_id: interviewerSession.userId,
      mode: 'peer_to_peer',
      status: 'cancelled',
    })
    expect(cancelPayload.participants).toEqual({
      scheduler_user_id: activeSession.userId,
      interviewer_user_id: interviewerSession.userId,
    })
  })

  it('cancel interview fails with explicit error when harness data source omits cancelInterview', async function run() {
    const interviewId = '55555555-5555-4555-8555-555555555555'
    const harness = createIntegrationHarness(
      { freeAiInterviews: 0, credits: 0 },
      [
        createInterviewRecord({
          id: interviewId,
          scheduler_id: activeSession.userId,
          mode: 'ai_led',
        }),
      ],
      { cancelInterview: undefined },
    )

    await expect(
      harness.interviewService.cancelInterview(activeSession, { id: interviewId }),
    ).rejects.toThrow('cancelInterview data source not configured in integration harness')
  })

  it('matcher write emits interview.match.created with required non-null participant B, mirrored identities, confirmation to both, and reminder schedule', async function run() {
    const harness = createIntegrationHarness({ freeAiInterviews: 0, credits: 0 })

    const candidateRows: MatcherCandidateRow[] = [
      createMatcherCandidateRow({
        request_id: '11111111-1111-4111-8111-111111111111',
        request_user_id: activeSession.userId,
        slot_id: 'a1111111-1111-4111-8111-111111111111',
        slot_start_time: '2026-05-22T14:00:00.000Z',
        slot_end_time: '2026-05-22T15:00:00.000Z',
      }),
      createMatcherCandidateRow({
        request_id: '22222222-2222-4222-8222-222222222222',
        request_user_id: interviewerSession.userId,
        slot_id: 'a2222222-2222-4222-8222-222222222222',
        slot_start_time: '2026-05-22T14:00:00.000Z',
        slot_end_time: '2026-05-22T15:00:00.000Z',
      }),
    ]

    const matcherRepository = {
      async listCandidateRows() {
        return candidateRows
      },
      async executePairAttemptTransaction(
        pairAttempt: import('../matcher/types').MatcherPairAttempt,
        buildOutboxEvent?: (interview: import('../matcher/types').MatcherCreatedInterview) => NotificationOutboxEventRow,
      ) {
        const interview: import('../matcher/types').MatcherCreatedInterview = {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: activeSession.userId,
          interviewer_id: interviewerSession.userId,
          type: 'system_design',
          mode: 'peer_to_peer',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-05-22T14:00:00.000Z',
        }

        harness.interviews.set(interview.id, {
          ...interview,
          created_at: '2026-05-22T10:00:00.000Z',
          updated_at: '2026-05-22T10:00:00.000Z',
        })

        if (buildOutboxEvent) {
          const outboxEvent = buildOutboxEvent(interview)
          harness.outboxEvents.push({ ...outboxEvent })
        }

        return {
          status: 'created' as const,
          interviewId: interview.id,
          interview,
          diagnostics: { transactionConflicts: 0, transactionRetries: 0 },
        }
      },
    }

    const matcherService = new MatcherExecutionService(
      matcherRepository,
      undefined,
      {
        notificationService: harness.notificationService,
        notificationDispatchService: harness.notificationDispatchService,
        notificationTransport: harness.notificationTransport,
      },
    )

    const summary = await matcherService.runMatchCycle()
    expect(summary.matchesCreated).toBe(1)

    // Outbox event persisted
    expect(harness.outboxEvents).toHaveLength(1)
    const outboxEvent = harness.outboxEvents[0]
    expect(outboxEvent?.event_type).toBe('interview.match.created')
    expect(outboxEvent?.status).toBe('dispatched')

    // Payload has required non-null participant B
    const payload = outboxEvent?.event_payload as Record<string, unknown>
    expect(payload.interview).toMatchObject({
      scheduler_id: activeSession.userId,
      interviewer_id: interviewerSession.userId,
      mode: 'peer_to_peer',
      status: 'scheduled',
    })
    expect(payload.interview).not.toHaveProperty('interviewer_id', null)

    // Canonical identity mirrors
    expect(payload.participants).toEqual({
      scheduler_user_id: activeSession.userId,
      interviewer_user_id: interviewerSession.userId,
    })

    // Transport dispatched
    expect(harness.transportMessages).toHaveLength(1)
    expect(harness.transportMessages[0]).toMatchObject({
      event_type: 'interview.match.created',
    })

    // Consumer processes: confirmation to both participants + reminder
    const matchEvent = payload as unknown as import('../notification-queue-event-contract').InterviewMatchCreatedEvent
    await harness.consumer.processInterviewMatchCreated(matchEvent)

    expect(harness.deliveryCalls).toHaveLength(1)
    expect(harness.deliveryCalls[0]).toEqual({
      kind: 'confirmation',
      interviewId: '99999999-9999-4999-8999-999999999999',
      scheduledAt: '2026-05-22T14:00:00.000Z',
      recipientUserIds: [activeSession.userId, interviewerSession.userId],
      idempotencyKey: 'interview.match.created:99999999-9999-4999-8999-999999999999/confirmation',
    })

    expect(harness.reminderSchedules).toHaveLength(1)
    expect(harness.reminderSchedules[0]?.reminder_due_at).toBe('2026-05-22T13:30:00.000Z')
  })

  it('create failure produces no outbox event or transport side effect', async function run() {
    const harness = createIntegrationHarness({ freeAiInterviews: 0, credits: 0 })

    await expect(
      harness.interviewService.createInterview(activeSession, {
        type: 'system_design',
        mode: 'ai_led',
        scheduled_at: 'now',
      }),
    ).rejects.toThrow()

    expect(harness.outboxEvents).toHaveLength(0)
    expect(harness.transportMessages).toHaveLength(0)
    expect(harness.deliveryCalls).toHaveLength(0)
  })

  it('matcher skipped/write-failure produces no outbox dispatch side effect', async function run() {
    const harness = createIntegrationHarness({ freeAiInterviews: 0, credits: 0 })

    const matcherRepository = {
      async listCandidateRows() {
        return [
          createMatcherCandidateRow({
            request_id: '11111111-1111-4111-8111-111111111111',
            request_user_id: activeSession.userId,
            slot_id: 'a1111111-1111-4111-8111-111111111111',
            slot_start_time: '2026-05-22T14:00:00.000Z',
            slot_end_time: '2026-05-22T15:00:00.000Z',
          }),
        ]
      },
      async executePairAttemptTransaction() {
        return {
          status: 'skipped' as const,
          reason: 'request_quota_reached' as const,
          diagnostics: { transactionConflicts: 0, transactionRetries: 0 },
        }
      },
    }

    const matcherService = new MatcherExecutionService(
      matcherRepository,
      undefined,
      {
        notificationService: harness.notificationService,
        notificationDispatchService: harness.notificationDispatchService,
        notificationTransport: harness.notificationTransport,
      },
    )

    const summary = await matcherService.runMatchCycle()
    expect(summary.matchesCreated).toBe(0)
    expect(harness.outboxEvents).toHaveLength(0)
    expect(harness.transportMessages).toHaveLength(0)
  })

  it('duplicate dispatch and consumer handling remains idempotent with stable idempotency key', async function run() {
    const harness = createIntegrationHarness({ freeAiInterviews: 1, credits: 0 })

    const response = await harness.interviewService.createInterview(activeSession, {
      type: 'system_design',
      mode: 'ai_led',
      scheduled_at: '2026-05-22T14:00:00.000Z',
    })
    const interviewId = response.interview.id
    const idempotencyKey = `interview.created:${interviewId}`

    // First dispatch
    await harness.notificationDispatchService.dispatchOutboxEventByIdempotencyKey(
      idempotencyKey,
      harness.notificationTransport,
    )

    // Replay dispatch reuses same idempotency key for same lifecycle transition
    const messageCountBefore = harness.transportMessages.length
    await harness.notificationDispatchService.dispatchOutboxEventByIdempotencyKey(
      idempotencyKey,
      harness.notificationTransport,
    )
    expect(harness.transportMessages.length).toBe(messageCountBefore + 1)
    expect(harness.transportMessages[0]?.idempotency_key).toBe(idempotencyKey)
    expect(harness.transportMessages[1]?.idempotency_key).toBe(idempotencyKey)

    // Consumer processes original delivery plus replay
    await harness.consumer.processInterviewCreated(
      harness.transportMessages[0] as import('../notification-queue-event-contract').InterviewCreatedEvent,
    )
    await harness.consumer.processInterviewCreated(
      harness.transportMessages[1] as import('../notification-queue-event-contract').InterviewCreatedEvent,
    )

    // Single confirmation, single reminder schedule
    expect(harness.deliveryCalls.filter((c) => c.kind === 'confirmation')).toHaveLength(1)
    expect(harness.reminderSchedules).toHaveLength(1)

    // Stable idempotency key reused
    expect(harness.outboxEvents[0]?.idempotency_key).toBe(idempotencyKey)
    expect(harness.reminderSchedules[0]?.idempotency_key).toBe(idempotencyKey)
  })
})

/** Converts a NotificationQueueEvent into a NotificationOutboxEventRow for test-harness persistence. */
function toOutboxRow(event: NotificationQueueEvent): NotificationOutboxEventRow {
  return {
    idempotency_key: event.idempotency_key,
    event_type: event.event_type,
    event_payload: event as unknown as Record<string, unknown>,
    status: 'pending',
    dispatch_attempts: 0,
    last_dispatch_attempted_at: null,
    created_at: '2026-05-22T10:00:00.000Z',
    updated_at: '2026-05-22T10:00:00.000Z',
  }
}
function createIntegrationHarness(
  accountState: { freeAiInterviews: number; credits: number; freeStandardInterviews?: number },
  seedInterviews: readonly Interview[] = [],
  dataSourceOverrides: Partial<InterviewRepositoryDataSource> = {},
) {
  const outboxEvents: NotificationOutboxEventRow[] = []
  const checkpoints: Array<{ idempotency_key: string; checkpoint_key: string }> = []
  const reminderSchedules: NotificationReminderScheduleRow[] = []
  const interviews = new Map<string, InterviewState>()
  const transportMessages: NotificationTransportMessage[] = []
  const deliveryCalls: Array<{
    kind: 'confirmation' | 'reminder'
    interviewId: string
    scheduledAt: string
    recipientUserIds: string[]
    idempotencyKey: string
  }> = []

  for (const interview of seedInterviews) {
    interviews.set(interview.id, {
      id: interview.id,
      scheduler_id: interview.scheduler_id,
      interviewer_id: interview.interviewer_id,
      type: interview.type,
      mode: interview.mode,
      tier: interview.tier,
      status: interview.status,
      scheduled_at: interview.scheduled_at,
      created_at: interview.created_at,
      updated_at: interview.updated_at,
    })
  }

  const notificationRepository = new NotificationRepository({
    dataSource: {
      async persistOutboxEvent(event: NotificationOutboxEventRow): Promise<void> {
        const existing = outboxEvents.find((e) => e.idempotency_key === event.idempotency_key)
        if (!existing) {
          outboxEvents.push({ ...event })
        }
      },
      async fetchPendingOutboxEvents(limit: number): Promise<NotificationOutboxEventRow[]> {
        return outboxEvents.filter((e) => e.status === 'pending').slice(0, limit)
      },
      async fetchOutboxEventByIdempotencyKey(
        idempotencyKey: string,
      ): Promise<NotificationOutboxEventRow | null> {
        return outboxEvents.find((e) => e.idempotency_key === idempotencyKey) ?? null
      },
      async markOutboxEventDispatched(idempotencyKey: string): Promise<void> {
        const event = outboxEvents.find((e) => e.idempotency_key === idempotencyKey)
        if (event) {
          event.status = 'dispatched'
        }
      },
      async recordDispatchFailure(idempotencyKey: string): Promise<void> {
        const event = outboxEvents.find((e) => e.idempotency_key === idempotencyKey)
        if (event) {
          event.dispatch_attempts += 1
          event.status = 'failed'
        }
      },
      async recordCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<void> {
        const exists = checkpoints.some(
          (c) => c.idempotency_key === idempotencyKey && c.checkpoint_key === checkpointKey,
        )
        if (!exists) {
          checkpoints.push({ idempotency_key: idempotencyKey, checkpoint_key: checkpointKey })
        }
      },
      async hasCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<boolean> {
        return checkpoints.some(
          (c) => c.idempotency_key === idempotencyKey && c.checkpoint_key === checkpointKey,
        )
      },
      async createReminderSchedule(schedule: NotificationReminderScheduleRow): Promise<void> {
        const exists = reminderSchedules.some((s) => s.idempotency_key === schedule.idempotency_key)
        if (!exists) {
          reminderSchedules.push({ ...schedule })
        }
      },
      async listDueReminderSchedules(
        before: string,
        limit?: number,
      ): Promise<NotificationReminderScheduleRow[]> {
        return reminderSchedules
          .filter((s) => s.status === 'pending' && s.reminder_due_at <= before)
          .slice(0, limit)
      },
      async suppressReminderSchedulesForInterview(interviewId: string): Promise<number> {
        let count = 0
        for (const schedule of reminderSchedules) {
          if (schedule.interview_id === interviewId && schedule.status === 'pending') {
            schedule.status = 'suppressed'
            count += 1
          }
        }
        return count
      },
      async markReminderDispatched(id: string): Promise<void> {
        const schedule = reminderSchedules.find((s) => s.id === id)
        if (schedule) {
          schedule.status = 'dispatched'
        }
      },
      async markReminderDispatchedBatch(ids: string[]): Promise<void> {
        for (const id of ids) {
          const schedule = reminderSchedules.find((s) => s.id === id)
          if (schedule) {
            schedule.status = 'dispatched'
          }
        }
      },
      async getInterviewState(id: string): Promise<InterviewState | null> {
        return interviews.get(id) ?? null
      },
      async getInterviewStates(ids: string[]): Promise<Map<string, InterviewState>> {
        const entries = ids
          .map((id) => {
            const state = interviews.get(id)
            return state ? ([id, state] as const) : null
          })
          .filter((entry): entry is readonly [string, InterviewState] => entry !== null)
        return new Map(entries)
      },
    },
  })

  const notificationService = new NotificationService(
    notificationRepository,
    () => 'schedule-id',
    () => '2026-05-22T10:00:00.000Z',
  )

  const notificationTransport: NotificationTransport = {
    async send(message) {
      transportMessages.push(message)
    },
  }

  const notificationDispatchService = new NotificationDispatchService(
    notificationService,
    () => '2026-05-22T10:00:00.000Z',
  )

  const deliveryPort: NotificationDeliveryPort = {
    async send(input): Promise<void> {
      deliveryCalls.push(input)
    },
  }

  const consumer = new NotificationConsumerService(
    notificationService,
    () => '2026-05-22T10:00:00.000Z',
    undefined,
    deliveryPort,
  )

  // Build interview repository with outbox persistence wired into data source
  const inMemoryDataSource: InterviewRepositoryDataSource = {
    ...createInMemoryInterviewDataSource(
      [
        {
          userId: activeSession.userId,
          credits: accountState.credits,
          freeStandardInterviews: accountState.freeStandardInterviews ?? 1,
          freeAiInterviews: accountState.freeAiInterviews,
        },
      ],
      seedInterviews,
    ),
    ...dataSourceOverrides,
  }

  const interviewRepository = new InterviewRepository({
    persistOutboxEvent: async (outboxEvent) => {
      await notificationRepository.persistOutboxEvent(toOutboxRow(outboxEvent))
    },
    dataSource: {
      ...inMemoryDataSource,
      async createDirectInterview(input, outboxEvent) {
        const interview = await inMemoryDataSource.createDirectInterview(input, outboxEvent)

        if (outboxEvent) {
          await notificationRepository.persistOutboxEvent(toOutboxRow(outboxEvent))
        }

        interviews.set(interview.id, {
          id: interview.id,
          scheduler_id: interview.scheduler_id,
          interviewer_id: interview.interviewer_id,
          type: interview.type,
          mode: interview.mode,
          tier: interview.tier,
          status: interview.status,
          scheduled_at: interview.scheduled_at,
          created_at: interview.created_at,
          updated_at: interview.updated_at,
        })

        return interview
      },
      async cancelInterview(input) {
        const cancelInterview = inMemoryDataSource.cancelInterview

        if (!cancelInterview) {
          throw new Error('cancelInterview data source not configured in integration harness')
        }

        const result = await cancelInterview(input)

        if (result.outcome === 'cancelled') {
          interviews.set(result.interview.id, {
            id: result.interview.id,
            scheduler_id: result.interview.scheduler_id,
            interviewer_id: result.interview.interviewer_id,
            type: result.interview.type,
            mode: result.interview.mode,
            tier: result.interview.tier,
            status: result.interview.status,
            scheduled_at: result.interview.scheduled_at,
            created_at: result.interview.created_at,
            updated_at: result.interview.updated_at,
          })
        }

        return result
      },
    },
  })

  const interviewService = new InterviewService(
    interviewRepository,
    undefined,
    () => '22222222-2222-4222-8222-222222222222',
    () => '2026-05-22T10:00:00.000Z',
    undefined,
    undefined,
    notificationService,
    notificationDispatchService,
    notificationTransport,
  )

  return {
    outboxEvents,
    checkpoints,
    reminderSchedules,
    interviews,
    transportMessages,
    deliveryCalls,
    notificationService,
    notificationRepository,
    notificationDispatchService,
    notificationTransport,
    consumer,
    interviewRepository,
    interviewService,
  }
}

function createInterviewRecord(
  overrides: Partial<Interview & InterviewDetail> = {},
): Interview & InterviewDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-13T10:00:00.000Z',
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'not_started',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    screenshots_finalized_at: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
    ...overrides,
  }
}

function createMatcherCandidateRow(
  overrides: Partial<MatcherCandidateRow> = {},
): MatcherCandidateRow {
  return {
    request_id: '11111111-1111-4111-8111-111111111111',
    request_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    request_created_at: '2026-05-22T09:00:00.000Z',
    interview_type: 'system_design',
    slot_id: 'a1111111-1111-4111-8111-111111111111',
    slot_start_time: '2026-05-22T14:00:00.000Z',
    slot_end_time: '2026-05-22T15:00:00.000Z',
    ...overrides,
  }
}
