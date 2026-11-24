import { z } from 'zod'
import type {
  AccountPrivacyCleanupRequestedEvent,
  InterviewCancelledEvent,
  InterviewCreatedEvent,
  InterviewMatchCreatedEvent,
  InterviewPremiumBookedEvent,
} from '../notification-queue-event-contract'
import type { DelayedSendOptions } from './delayed-send'

export const reminderDueTransportMessageSchema = z.object({
  message_type: z.literal('reminder.due'),
  idempotency_key: z.string().min(1),
  interview_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }),
  reminder_due_at: z.string().datetime({ offset: true }),
})

export type ReminderDueTransportMessage = z.infer<typeof reminderDueTransportMessageSchema>

const workDueBase = {
  message_type: z.literal('work.due'),
  idempotency_key: z.string().min(1),
  entity_id: z.string().uuid(),
  due_at: z.string().datetime({ offset: true }),
}

export const workDueTransportMessageSchema = z.discriminatedUnion('duty', [
  z.object({ ...workDueBase, duty: z.literal('recording_overdue') }),
  z.object({ ...workDueBase, duty: z.literal('start_claim_stale') }),
])

export type WorkDueTransportMessage = z.infer<typeof workDueTransportMessageSchema>
export type WorkDueDuty = WorkDueTransportMessage['duty']

export type NotificationTransportMessage =
  | InterviewCreatedEvent
  | InterviewCancelledEvent
  | InterviewMatchCreatedEvent
  | InterviewPremiumBookedEvent
  | AccountPrivacyCleanupRequestedEvent
  | ReminderDueTransportMessage
  | WorkDueTransportMessage

export type NotificationTransport = {
  send(message: NotificationTransportMessage, options?: DelayedSendOptions): Promise<void>
}
