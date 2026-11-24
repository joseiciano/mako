import { describe, expect, it } from 'vitest'
import { NotificationConsumerService } from './notification-consumer-service'
import type {
  InterviewCreatedEvent,
  InterviewCancelledEvent,
  InterviewMatchCreatedEvent,
  InterviewPremiumBookedEvent,
} from '../notification-queue-event-contract'
import type {
  NotificationOutboxEventRow,
  NotificationReminderScheduleRow,
  InterviewState,
} from './notification-types'
import type { NotificationRepositoryDataSource } from './notification-repository'
import { NotificationService } from './notification-service'
import { NotificationDispatchService } from './notification-dispatch-service'
import type { NotificationDeliveryPort } from './notification-consumer-service'
import type {
  NotificationTransport,
  NotificationTransportMessage,
  ReminderDueTransportMessage,
} from './notification-transport-message'
import type { DelayedSendOptions } from './delayed-send'

describe('NotificationConsumerService', function notificationConsumerServiceSuite() {
  it('processes interview.created by recording confirmation checkpoint and scheduling reminder', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewCreated(createInterviewCreatedEvent())

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:confirmation',
    })
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
  })

  it('does not duplicate side effects on repeated interview.created delivery', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })
    const event = createInterviewCreatedEvent()

    await consumer.processInterviewCreated(event)
    await consumer.processInterviewCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.reminderSchedules).toHaveLength(1)
  })

  it('suppresses reminder scheduling when interview is in the past', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T15:00:00.000Z',
    })

    await consumer.processInterviewCreated(
      createInterviewCreatedEvent('2026-05-22T14:00:00.000Z'),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('suppresses reminder scheduling when interview is less than 30 minutes away', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T13:45:00.000Z',
    })

    await consumer.processInterviewCreated(
      createInterviewCreatedEvent('2026-05-22T14:00:00.000Z'),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('schedules a reminder when interview.created is processed exactly 30 minutes before scheduled_at', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T13:30:00.000Z',
    })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewCreated(
      createInterviewCreatedEvent('2026-05-22T14:00:00.000Z'),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
    expect(dataSource.reminderSchedules[0]?.reminder_due_at).toBe('2026-05-22T13:30:00.000Z')
  })

  it('suppresses reminder for AI immediate sessions when scheduled_at is now', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T14:00:00.000Z',
    })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewCreated(
      createInterviewCreatedEvent('2026-05-22T14:00:00.000Z'),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('does not recreate reminder on replay when interview is no longer scheduled', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewCreatedEvent()

    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    // Simulate crash after confirmation checkpoint but before reminder scheduling
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.created:confirmation',
    )

    await consumer.processInterviewCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('does not recreate reminder on replay when interview state is missing', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewCreatedEvent()

    // No interview in dataSource — simulate state missing after cancellation or deletion
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.created:confirmation',
    )

    await consumer.processInterviewCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('does not recreate match reminder on replay when interview is no longer scheduled', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewMatchCreatedEvent()

    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    // Simulate crash after confirmation checkpoint but before reminder scheduling
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.match.created:confirmation',
    )

    await consumer.processInterviewMatchCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('does not recreate match reminder on replay when interview state is missing', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewMatchCreatedEvent()

    // No interview in dataSource — simulate state missing after cancellation or deletion
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.match.created:confirmation',
    )

    await consumer.processInterviewMatchCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('does not create a second reminder on replay when the first schedule is dispatched', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewCreatedEvent()

    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    // Simulate a previously created and dispatched reminder schedule
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        idempotency_key: event.idempotency_key,
        status: 'dispatched',
      }),
    )

    // Simulate crash before reminder checkpoint was recorded
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.created:confirmation',
    )

    await consumer.processInterviewCreated(event)

    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
  })

  it('does not create a second reminder on replay when the first schedule is suppressed', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewCreatedEvent()

    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    // Simulate a previously created and suppressed reminder schedule
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        idempotency_key: event.idempotency_key,
        status: 'suppressed',
      }),
    )

    // Simulate crash before reminder checkpoint was recorded
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.created:confirmation',
    )

    await consumer.processInterviewCreated(event)

    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
  })

  it('does not create a second match reminder on replay when the first schedule is dispatched', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewMatchCreatedEvent()

    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    // Simulate a previously created and dispatched reminder schedule
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        idempotency_key: event.idempotency_key,
        status: 'dispatched',
      }),
    )

    // Simulate crash before reminder checkpoint was recorded
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.match.created:confirmation',
    )

    await consumer.processInterviewMatchCreated(event)

    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:reminder',
    })
  })

  it('does not create a second match reminder on replay when the first schedule is suppressed', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewMatchCreatedEvent()

    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    // Simulate a previously created and suppressed reminder schedule
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        idempotency_key: event.idempotency_key,
        status: 'suppressed',
      }),
    )

    // Simulate crash before reminder checkpoint was recorded
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.match.created:confirmation',
    )

    await consumer.processInterviewMatchCreated(event)

    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:reminder',
    })
  })

  it('processes interview.premium_booked by recording confirmation checkpoint and scheduling reminder', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'premium',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewPremiumBooked(createInterviewPremiumBookedEvent())

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'premium-booking:interview-id',
      checkpoint_key: 'interview.premium_booked:confirmation',
    })
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'premium-booking:interview-id',
      checkpoint_key: 'interview.premium_booked:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
  })

  it('sends confirmation for interview.premium_booked to scheduler and interviewer exactly once', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'premium',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })
    const event = createInterviewPremiumBookedEvent()

    await consumer.processInterviewPremiumBooked(event)
    await consumer.processInterviewPremiumBooked(event)

    expect(deliveryCalls).toHaveLength(1)
    expect(deliveryCalls[0]).toEqual({
      kind: 'confirmation',
      interviewId: 'interview-id',
      scheduledAt: '2026-05-22T14:00:00.000Z',
      recipientUserIds: ['scheduler-id', 'interviewer-id'],
      idempotencyKey: 'premium-booking:interview-id/confirmation',
    })
  })

  it('schedules a reminder when interview.premium_booked is processed exactly 30 minutes before scheduled_at', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T13:30:00.000Z',
    })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'premium',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewPremiumBooked(createInterviewPremiumBookedEvent())

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'premium-booking:interview-id',
      checkpoint_key: 'interview.premium_booked:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
    expect(dataSource.reminderSchedules[0]?.reminder_due_at).toBe('2026-05-22T13:30:00.000Z')
  })

  it('suppresses premium booking reminder scheduling when interview is in the past', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T15:00:00.000Z',
    })

    await consumer.processInterviewPremiumBooked(
      createInterviewPremiumBookedEvent({ interview: { ...createInterviewPremiumBookedEvent().interview, scheduled_at: '2026-05-22T14:00:00.000Z' } }),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'premium-booking:interview-id',
      checkpoint_key: 'interview.premium_booked:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('suppresses premium booking reminder scheduling when interview is less than 30 minutes away', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T13:45:00.000Z',
    })

    await consumer.processInterviewPremiumBooked(createInterviewPremiumBookedEvent())

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'premium-booking:interview-id',
      checkpoint_key: 'interview.premium_booked:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('suppresses premium booking reminder when interview is not scheduled', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'premium',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewPremiumBooked(createInterviewPremiumBookedEvent())

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'premium-booking:interview-id',
      checkpoint_key: 'interview.premium_booked:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('replay via confirmation and reminder checkpoints emits no duplicate confirmation or reminder', async function run() {
    const { consumer, dataSource, notificationService, deliveryCalls } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'premium',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })
    const event = createInterviewPremiumBookedEvent()
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.premium_booked:confirmation',
    )
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.premium_booked:reminder',
    )

    await consumer.processInterviewPremiumBooked(event)
    await consumer.processInterviewPremiumBooked(event)

    expect(deliveryCalls).toHaveLength(0)
    expect(dataSource.reminderSchedules).toHaveLength(0)
    expect(dataSource.checkpoints).toHaveLength(2)
  })

  it('suppresses premium booking reminder schedules via interview.cancelled suppression', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        interview_id: 'interview-id',
        idempotency_key: 'premium-booking:interview-id',
        status: 'pending',
      }),
    )

    await consumer.processInterviewCancelled(createInterviewCancelledEvent())

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.cancelled:interview-id',
      checkpoint_key: 'interview.cancelled:suppression',
    })
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
  })

  it('schedules a reminder when interview.match.created is processed exactly 30 minutes before scheduled_at', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T13:30:00.000Z',
    })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewMatchCreated(
      createInterviewMatchCreatedEvent(),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
    expect(dataSource.reminderSchedules[0]?.reminder_due_at).toBe('2026-05-22T13:30:00.000Z')
  })

  it('suppresses reminder for peer-to-peer immediate sessions when scheduled_at is now', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T14:00:00.000Z',
    })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewMatchCreated(
      createInterviewMatchCreatedEvent(),
    )

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(0)
  })

  it('resumes reminder scheduling on replay when confirmation checkpoint already exists', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewCreatedEvent()

    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    // Simulate crash after confirmation checkpoint but before reminder scheduling
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.created:confirmation',
    )

    await consumer.processInterviewCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:confirmation',
    })
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
  })

  it('sends one delayed reminder.due message and marks the row dispatched when a schedule row is created', async function run() {
    const { consumer, dataSource, transportCalls } = createConsumerService()
    setScheduledInterview(dataSource)

    await consumer.processInterviewCreated(createInterviewCreatedEvent())

    expect(transportCalls).toEqual([
      {
        message: {
          message_type: 'reminder.due',
          idempotency_key: 'interview.created:interview-id',
          interview_id: 'interview-id',
          scheduled_at: '2026-05-22T14:00:00.000Z',
          reminder_due_at: '2026-05-22T13:30:00.000Z',
        },
        options: { delaySeconds: 210 * 60 },
      },
    ])
    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
  })

  it('sends the exact remaining delay when the reminder is due within 12 hours', async function run() {
    const { consumer, dataSource, transportCalls } = createConsumerService()
    setScheduledInterview(dataSource, '2026-05-22T12:00:00.000Z')

    await consumer.processInterviewCreated(createInterviewCreatedEvent('2026-05-22T12:00:00.000Z'))

    expect(transportCalls[0]?.options).toEqual({ delaySeconds: 90 * 60 })
  })

  it('leaves the row pending for the sweep when the first delayed send fails', async function run() {
    const { consumer, dataSource, transportCalls } = createConsumerService({ failSends: true })
    setScheduledInterview(dataSource)

    await consumer.processInterviewCreated(createInterviewCreatedEvent())

    expect(transportCalls).toHaveLength(0)
    expect(dataSource.reminderSchedules[0]?.status).toBe('pending')
    expect(dataSource.checkpoints).toContainEqual({
      idempotency_key: 'interview.created:interview-id',
      checkpoint_key: 'interview.created:reminder',
    })
  })

  it('sends a delayed reminder for match and premium bookings too', async function run() {
    const match = createConsumerService()
    setScheduledInterview(match.dataSource)
    await match.consumer.processInterviewMatchCreated(createInterviewMatchCreatedEvent())
    expect(match.transportCalls).toHaveLength(1)

    const premium = createConsumerService()
    setScheduledInterview(premium.dataSource)
    await premium.consumer.processInterviewPremiumBooked(createInterviewPremiumBookedEvent())
    expect(premium.transportCalls).toHaveLength(1)
  })

  it('re-sends an early reminder.due message with the remaining delay and records no checkpoint', async function run() {
    const { consumer, dataSource, transportCalls, deliveryCalls } = createConsumerService({
      now: () => '2026-05-22T12:00:00.000Z',
    })
    setScheduledInterview(dataSource)
    const message = createReminderDueMessage()

    await consumer.processReminderDue(message)

    expect(deliveryCalls).toHaveLength(0)
    expect(dataSource.checkpoints).toHaveLength(0)
    expect(transportCalls).toEqual([{ message, options: { delaySeconds: 90 * 60 } }])
  })

  it('caps the early re-send delay at 12 hours', async function run() {
    const { consumer, dataSource, transportCalls } = createConsumerService({
      now: () => '2026-05-21T10:00:00.000Z',
    })
    setScheduledInterview(dataSource)

    await consumer.processReminderDue(createReminderDueMessage())

    expect(transportCalls[0]?.options).toEqual({ delaySeconds: 12 * 3600 })
  })

  it('sends a due reminder once and treats a duplicate as a no-op', async function run() {
    const { consumer, dataSource, transportCalls, deliveryCalls } = createConsumerService({
      now: () => '2026-05-22T13:30:00.000Z',
    })
    setScheduledInterview(dataSource)
    const message = createReminderDueMessage()

    await consumer.processReminderDue(message)
    await consumer.processReminderDue(message)

    expect(deliveryCalls).toHaveLength(1)
    expect(transportCalls).toHaveLength(0)
  })

  it('throws when the early re-send fails so the queue retries', async function run() {
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T12:00:00.000Z',
      failSends: true,
    })
    setScheduledInterview(dataSource)

    await expect(consumer.processReminderDue(createReminderDueMessage())).rejects.toThrow('queue unavailable')
    expect(dataSource.checkpoints).toHaveLength(0)
  })

  it('does not re-send an early message for a cancelled interview', async function run() {
    const { consumer, dataSource, transportCalls } = createConsumerService({
      now: () => '2026-05-22T12:00:00.000Z',
    })
    setScheduledInterview(dataSource, '2026-05-22T14:00:00.000Z', 'cancelled')

    await consumer.processReminderDue(createReminderDueMessage())

    expect(transportCalls).toHaveLength(0)
    expect(dataSource.checkpoints).toHaveLength(1)
  })

  it('lets the sweep send a reminder whose delayed send failed', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService({ failSends: true })
    setScheduledInterview(dataSource)
    await consumer.processInterviewCreated(createInterviewCreatedEvent())
    expect(dataSource.reminderSchedules[0]?.status).toBe('pending')

    const sweepMessages: NotificationTransportMessage[] = []
    const dispatchService = new NotificationDispatchService(notificationService)
    await dispatchService.enqueueDueReminders(
      {
        async send(message) {
          sweepMessages.push(message)
        },
      },
      '2026-05-22T13:30:00.000Z',
    )

    expect(sweepMessages).toHaveLength(1)
    expect(sweepMessages[0]).toMatchObject({ message_type: 'reminder.due', interview_id: 'interview-id' })
    expect(dataSource.reminderSchedules[0]?.status).toBe('dispatched')
  })

  it('processes interview.cancelled by suppressing reminders and recording suppression checkpoint', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        interview_id: 'interview-id',
        status: 'pending',
      }),
    )

    await consumer.processInterviewCancelled(createInterviewCancelledEvent())

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.cancelled:interview-id',
      checkpoint_key: 'interview.cancelled:suppression',
    })
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
  })

  it('duplicate cancellation suppression is idempotent', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        interview_id: 'interview-id',
        status: 'pending',
      }),
    )
    const event = createInterviewCancelledEvent()

    await consumer.processInterviewCancelled(event)
    await consumer.processInterviewCancelled(event)

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
  })

  it('resumes suppression on replay after partial progress', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    dataSource.reminderSchedules.push(
      createReminderScheduleRow({
        interview_id: 'interview-id',
        status: 'pending',
      }),
    )
    const event = createInterviewCancelledEvent()

    // Simulate crash after suppression but before checkpoint
    await notificationService.suppressReminderSchedulesForInterview(event.interview.id)

    await consumer.processInterviewCancelled(event)

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.cancelled:interview-id',
      checkpoint_key: 'interview.cancelled:suppression',
    })
    expect(dataSource.reminderSchedules[0]?.status).toBe('suppressed')
  })

  it('processes interview.match.created by recording confirmation checkpoint and scheduling reminder', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewMatchCreated(createInterviewMatchCreatedEvent())

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:confirmation',
    })
    expect(dataSource.checkpoints[1]).toEqual({
      idempotency_key: 'interview.match.created:interview-id',
      checkpoint_key: 'interview.match.created:reminder',
    })
    expect(dataSource.reminderSchedules).toHaveLength(1)
    expect(dataSource.reminderSchedules[0]?.interview_id).toBe('interview-id')
  })

  it('does not duplicate side effects on repeated interview.match.created delivery', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })
    const event = createInterviewMatchCreatedEvent()

    await consumer.processInterviewMatchCreated(event)
    await consumer.processInterviewMatchCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.reminderSchedules).toHaveLength(1)
  })

  it('resumes match reminder scheduling on replay when confirmation checkpoint already exists', async function run() {
    const { consumer, dataSource, notificationService } = createConsumerService()
    const event = createInterviewMatchCreatedEvent()

    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    // Simulate crash after confirmation checkpoint but before reminder scheduling
    await notificationService.recordCheckpoint(
      event.idempotency_key,
      'interview.match.created:confirmation',
    )

    await consumer.processInterviewMatchCreated(event)

    expect(dataSource.checkpoints).toHaveLength(2)
    expect(dataSource.reminderSchedules).toHaveLength(1)
  })

  it('processes reminder.due with checkpoint and state guard', async function run() {
    const { consumer, dataSource } = createConsumerService({ now: () => '2026-05-22T13:30:00.000Z' })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'reminder:interview-id',
      checkpoint_key: 'reminder.due:reminder:interview-id',
    })
  })

  it('reminder-due processing is restart-safe via durable checkpoint state', async function run() {
    const { consumer, dataSource } = createConsumerService({ now: () => '2026-05-22T13:30:00.000Z' })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })
    const message = {
      message_type: 'reminder.due' as const,
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    }

    await consumer.processReminderDue(message)
    await consumer.processReminderDue(message)

    expect(dataSource.checkpoints).toHaveLength(1)
  })

  it('skips reminder-due when interview is not scheduled', async function run() {
    const { consumer, dataSource } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(dataSource.checkpoints).toHaveLength(1)
  })

  it('skips reminder-due when interview is not found', async function run() {
    const { consumer, dataSource } = createConsumerService()

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(dataSource.checkpoints).toHaveLength(1)
  })

  it('never mutates interview lifecycle state during processing', async function run() {
    const { consumer, dataSource } = createConsumerService()
    const interview: InterviewState = {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    }
    dataSource.interviews.set('interview-id', { ...interview })

    await consumer.processInterviewCreated(createInterviewCreatedEvent())
    await consumer.processInterviewCancelled(createInterviewCancelledEvent())

    const storedInterview = dataSource.interviews.get('interview-id')
    expect(storedInterview?.status).toBe('scheduled')
    expect(storedInterview?.updated_at).toBe('2026-05-22T10:00:00.000Z')
  })

  it('sends confirmation for interview.created with scheduler-only recipients', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewCreated(createInterviewCreatedEvent())

    expect(deliveryCalls).toHaveLength(1)
    expect(deliveryCalls[0]).toEqual({
      kind: 'confirmation',
      interviewId: 'interview-id',
      scheduledAt: '2026-05-22T14:00:00.000Z',
      recipientUserIds: ['scheduler-id'],
      idempotencyKey: 'interview.created:interview-id/confirmation',
    })
  })

  it('sends confirmation for interview.match.created with scheduler and interviewer recipients', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewMatchCreated(createInterviewMatchCreatedEvent())

    expect(deliveryCalls).toHaveLength(1)
    expect(deliveryCalls[0]).toEqual({
      kind: 'confirmation',
      interviewId: 'interview-id',
      scheduledAt: '2026-05-22T14:00:00.000Z',
      recipientUserIds: ['scheduler-id', 'interviewer-id'],
      idempotencyKey: 'interview.match.created:interview-id/confirmation',
    })
  })

  it('sends reminder for reminder.due with correct recipients based on interview mode', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService({ now: () => '2026-05-22T13:30:00.000Z' })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(deliveryCalls).toHaveLength(1)
    expect(deliveryCalls[0]).toEqual({
      kind: 'reminder',
      interviewId: 'interview-id',
      scheduledAt: '2026-05-22T14:00:00.000Z',
      recipientUserIds: ['scheduler-id', 'interviewer-id'],
      idempotencyKey: 'reminder:interview-id/delivery',
    })
  })

  it('sends reminder for reminder.due with scheduler-only recipients for ai_led mode', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService({ now: () => '2026-05-22T13:30:00.000Z' })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(deliveryCalls).toHaveLength(1)
    expect(deliveryCalls[0]).toEqual({
      kind: 'reminder',
      interviewId: 'interview-id',
      scheduledAt: '2026-05-22T14:00:00.000Z',
      recipientUserIds: ['scheduler-id'],
      idempotencyKey: 'reminder:interview-id/delivery',
    })
  })

  it('does not record checkpoint when delivery throws for interview.created', async function run() {
    const errorDeliveryPort: NotificationDeliveryPort = {
      async send(): Promise<void> {
        throw new Error('delivery failed')
      },
    }
    const { consumer, dataSource } = createConsumerService({
      deliveryPort: errorDeliveryPort,
    })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await expect(consumer.processInterviewCreated(createInterviewCreatedEvent())).rejects.toThrow(
      'delivery failed',
    )

    expect(dataSource.checkpoints).toHaveLength(0)
  })

  it('does not record checkpoint when delivery throws for reminder.due', async function run() {
    const errorDeliveryPort: NotificationDeliveryPort = {
      async send(): Promise<void> {
        throw new Error('delivery failed')
      },
    }
    const { consumer, dataSource } = createConsumerService({
      now: () => '2026-05-22T13:30:00.000Z',
      deliveryPort: errorDeliveryPort,
    })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await expect(
      consumer.processReminderDue({
        message_type: 'reminder.due',
        idempotency_key: 'reminder:interview-id',
        interview_id: 'interview-id',
        scheduled_at: '2026-05-22T14:00:00.000Z',
        reminder_due_at: '2026-05-22T13:30:00.000Z',
      }),
    ).rejects.toThrow('delivery failed')

    expect(dataSource.checkpoints).toHaveLength(0)
  })

  it('does not send on suppression paths for interview.created reminder', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processInterviewCreated(createInterviewCreatedEvent())

    // Confirmation send still happens, but reminder suppression does not send
    expect(deliveryCalls).toHaveLength(1)
    expect(deliveryCalls[0]?.kind).toBe('confirmation')
  })

  it('does not send on suppression paths for reminder.due', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(deliveryCalls).toHaveLength(0)
    expect(dataSource.checkpoints).toHaveLength(1)
  })

  it('suppresses reminder.due when scheduled_at no longer matches message reminder_due_at', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService()
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T15:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(deliveryCalls).toHaveLength(0)
    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'reminder:interview-id',
      checkpoint_key: 'reminder.due:reminder:interview-id',
    })
  })

  it('suppresses reminder.due when interview start time is already in the past even if status is still scheduled', async function run() {
    const { consumer, dataSource, deliveryCalls } = createConsumerService({
      now: () => '2026-05-22T15:00:00.000Z',
    })
    dataSource.interviews.set('interview-id', {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    })

    await consumer.processReminderDue({
      message_type: 'reminder.due',
      idempotency_key: 'reminder:interview-id',
      interview_id: 'interview-id',
      scheduled_at: '2026-05-22T14:00:00.000Z',
      reminder_due_at: '2026-05-22T13:30:00.000Z',
    })

    expect(deliveryCalls).toHaveLength(0)
    expect(dataSource.checkpoints).toHaveLength(1)
    expect(dataSource.checkpoints[0]).toEqual({
      idempotency_key: 'reminder:interview-id',
      checkpoint_key: 'reminder.due:reminder:interview-id',
    })
  })
})

type InMemoryNotificationDataSource = {
  outboxEvents: NotificationOutboxEventRow[]
  checkpoints: Array<{ idempotency_key: string; checkpoint_key: string }>
  reminderSchedules: NotificationReminderScheduleRow[]
  interviews: Map<string, InterviewState>
}

function createConsumerService(options: {
  now?: () => string
  deliveryPort?: NotificationDeliveryPort
  failSends?: boolean
} = {}): {
  consumer: NotificationConsumerService
  transportCalls: Array<{ message: NotificationTransportMessage; options?: DelayedSendOptions }>
  dataSource: InMemoryNotificationDataSource
  notificationService: NotificationService
  deliveryCalls: Array<{
    kind: 'confirmation' | 'reminder'
    interviewId: string
    scheduledAt: string
    recipientUserIds: string[]
    idempotencyKey: string
  }>
} {
  const dataSource: InMemoryNotificationDataSource = {
    outboxEvents: [],
    checkpoints: [],
    reminderSchedules: [],
    interviews: new Map(),
  }

  const repository: NotificationRepositoryDataSource = {
    async persistOutboxEvent(): Promise<void> {},

    async fetchPendingOutboxEvents(): Promise<NotificationOutboxEventRow[]> {
      return []
    },

    async fetchOutboxEventByIdempotencyKey(): Promise<NotificationOutboxEventRow | null> {
      return null
    },

    async markOutboxEventDispatched(): Promise<void> {},

    async recordDispatchFailure(): Promise<void> {},

    async recordCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<void> {
      const exists = dataSource.checkpoints.some(
        (c) => c.idempotency_key === idempotencyKey && c.checkpoint_key === checkpointKey,
      )
      if (!exists) {
        dataSource.checkpoints.push({ idempotency_key: idempotencyKey, checkpoint_key: checkpointKey })
      }
    },

    async hasCheckpoint(idempotencyKey: string, checkpointKey: string): Promise<boolean> {
      return dataSource.checkpoints.some(
        (c) => c.idempotency_key === idempotencyKey && c.checkpoint_key === checkpointKey,
      )
    },

    async createReminderSchedule(schedule: NotificationReminderScheduleRow): Promise<void> {
      const exists = dataSource.reminderSchedules.some(
        (s) => s.idempotency_key === schedule.idempotency_key,
      )
      if (!exists) {
        dataSource.reminderSchedules.push({ ...schedule })
      }
    },

    async listDueReminderSchedules(before: string): Promise<NotificationReminderScheduleRow[]> {
      return dataSource.reminderSchedules.filter(
        (s) => s.status === 'pending' && s.reminder_due_at <= before,
      )
    },

    async suppressReminderSchedulesForInterview(interviewId: string): Promise<number> {
      let count = 0
      for (const schedule of dataSource.reminderSchedules) {
        if (schedule.interview_id === interviewId && schedule.status === 'pending') {
          schedule.status = 'suppressed'
          count += 1
        }
      }
      return count
    },

    async markReminderDispatched(id: string): Promise<void> {
      for (const schedule of dataSource.reminderSchedules) {
        if (schedule.id === id && schedule.status === 'pending') {
          schedule.status = 'dispatched'
        }
      }
    },

    async markReminderDispatchedBatch(ids: string[]): Promise<void> {
      for (const id of ids) await repository.markReminderDispatched(id)
    },

    async getInterviewState(id: string): Promise<InterviewState | null> {
      return dataSource.interviews.get(id) ?? null
    },

    async getInterviewStates(ids: string[]): Promise<Map<string, InterviewState>> {
      return new Map(
        ids.flatMap((id) => {
          const interview = dataSource.interviews.get(id)
          return interview ? [[id, interview] as const] : []
        }),
      )
    },
  }

  const service = new NotificationService(
    repository as unknown as import('./notification-repository').NotificationRepository,
    () => 'schedule-id',
    options.now ?? (() => '2026-05-22T10:00:00.000Z'),
  )

  const deliveryCalls: Array<{
    kind: 'confirmation' | 'reminder'
    interviewId: string
    scheduledAt: string
    recipientUserIds: string[]
    idempotencyKey: string
  }> = []

  const defaultDeliveryPort: NotificationDeliveryPort = {
    async send(input): Promise<void> {
      deliveryCalls.push(input)
    },
  }

  const transportCalls: Array<{ message: NotificationTransportMessage; options?: DelayedSendOptions }> = []
  const transport: NotificationTransport = {
    async send(message, sendOptions): Promise<void> {
      if (options.failSends) throw new Error('queue unavailable')
      transportCalls.push({ message, options: sendOptions })
    },
  }

  const consumer = new NotificationConsumerService(
    service,
    options.now ?? (() => '2026-05-22T10:00:00.000Z'),
    undefined,
    options.deliveryPort ?? defaultDeliveryPort,
    transport,
  )

  return { consumer, dataSource, notificationService: service, deliveryCalls, transportCalls }
}

function createInterviewCreatedEvent(
  scheduledAt: string = '2026-05-22T14:00:00.000Z',
): InterviewCreatedEvent {
  return {
    event_type: 'interview.created',
    event_id: 'event-id',
    idempotency_key: 'interview.created:interview-id',
    occurred_at: '2026-05-22T10:00:00.000Z',
    interview: {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      booking_channel: 'ai_direct',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: scheduledAt,
    },
    participants: {
      scheduler_user_id: 'scheduler-id',
      interviewer_user_id: null,
    },
  }
}

function createInterviewCancelledEvent(
  overrides: Partial<InterviewCancelledEvent> = {},
): InterviewCancelledEvent {
  return {
    event_type: 'interview.cancelled',
    event_id: 'event-id',
    idempotency_key: 'interview.cancelled:interview-id',
    occurred_at: '2026-05-22T10:00:00.000Z',
    interview: {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: null,
      type: 'system_design',
      mode: 'ai_led',
      booking_channel: 'ai_direct',
      tier: 'standard',
      status: 'cancelled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
    },
    participants: {
      scheduler_user_id: 'scheduler-id',
      interviewer_user_id: null,
    },
    ...overrides,
  } as InterviewCancelledEvent
}

function createInterviewMatchCreatedEvent(
  overrides: Partial<InterviewMatchCreatedEvent> = {},
): InterviewMatchCreatedEvent {
  return {
    event_type: 'interview.match.created',
    event_id: 'event-id',
    idempotency_key: 'interview.match.created:interview-id',
    occurred_at: '2026-05-22T10:00:00.000Z',
    interview: {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      booking_channel: 'standard_match',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
    },
    participants: {
      scheduler_user_id: 'scheduler-id',
      interviewer_user_id: 'interviewer-id',
    },
    ...overrides,
  } as InterviewMatchCreatedEvent
}

function createInterviewPremiumBookedEvent(
  overrides: Partial<InterviewPremiumBookedEvent> = {},
): InterviewPremiumBookedEvent {
  return {
    event_type: 'interview.premium_booked',
    event_id: 'event-id',
    idempotency_key: 'premium-booking:interview-id',
    occurred_at: '2026-05-22T10:00:00.000Z',
    interview: {
      id: 'interview-id',
      scheduler_id: 'scheduler-id',
      interviewer_id: 'interviewer-id',
      type: 'system_design',
      mode: 'peer_to_peer',
      booking_channel: 'verified_interviewer',
      tier: 'premium',
      status: 'scheduled',
      scheduled_at: '2026-05-22T14:00:00.000Z',
    },
    participants: {
      scheduler_user_id: 'scheduler-id',
      interviewer_user_id: 'interviewer-id',
    },
    ...overrides,
  } as InterviewPremiumBookedEvent
}

function createReminderScheduleRow(
  overrides: Partial<NotificationReminderScheduleRow> = {},
): NotificationReminderScheduleRow {
  return {
    id: 'schedule-id',
    interview_id: 'interview-id',
    idempotency_key: 'default-key',
    reminder_due_at: '2026-05-22T13:00:00.000Z',
    status: 'pending',
    created_at: '2026-05-22T10:00:00.000Z',
    updated_at: '2026-05-22T10:00:00.000Z',
    ...overrides,
  }
}

function setScheduledInterview(
  dataSource: InMemoryNotificationDataSource,
  scheduledAt: string = '2026-05-22T14:00:00.000Z',
  status: InterviewState['status'] = 'scheduled',
): void {
  dataSource.interviews.set('interview-id', {
    id: 'interview-id',
    scheduler_id: 'scheduler-id',
    interviewer_id: 'interviewer-id',
    type: 'system_design',
    mode: 'peer_to_peer',
    tier: 'standard',
    status,
    scheduled_at: scheduledAt,
    created_at: '2026-05-22T10:00:00.000Z',
    updated_at: '2026-05-22T10:00:00.000Z',
  })
}

function createReminderDueMessage(): ReminderDueTransportMessage {
  return {
    message_type: 'reminder.due',
    idempotency_key: 'interview.created:interview-id',
    interview_id: 'interview-id',
    scheduled_at: '2026-05-22T14:00:00.000Z',
    reminder_due_at: '2026-05-22T13:30:00.000Z',
  }
}
