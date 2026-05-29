import { z } from 'zod'
import type {
  InterviewCancelledEvent,
  InterviewCreatedEvent,
  InterviewMatchCreatedEvent,
} from '../notification-queue-event-contract'

export const reminderDueTransportMessageSchema = z.object({
  message_type: z.literal('reminder.due'),
  idempotency_key: z.string().min(1),
  interview_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }),
  reminder_due_at: z.string().datetime({ offset: true }),
})

export type ReminderDueTransportMessage = z.infer<typeof reminderDueTransportMessageSchema>

export type NotificationTransportMessage =
  | InterviewCreatedEvent
  | InterviewCancelledEvent
  | InterviewMatchCreatedEvent
  | ReminderDueTransportMessage

export type NotificationTransport = {
  send(message: NotificationTransportMessage): Promise<void>
}
