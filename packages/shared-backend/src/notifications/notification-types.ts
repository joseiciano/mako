import { z } from 'zod'

export const outboxEventStatusSchema = z.enum(['pending', 'dispatched', 'failed'])
export type OutboxEventStatus = z.infer<typeof outboxEventStatusSchema>

export const reminderScheduleStatusSchema = z.enum(['pending', 'suppressed', 'dispatched'])
export type ReminderScheduleStatus = z.infer<typeof reminderScheduleStatusSchema>

export const notificationOutboxEventRowSchema = z.object({
  idempotency_key: z.string().min(1),
  event_type: z.string().min(1),
  event_payload: z.record(z.unknown()),
  status: outboxEventStatusSchema,
  dispatch_attempts: z.number().int().nonnegative(),
  last_dispatch_attempted_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type NotificationOutboxEventRow = z.infer<typeof notificationOutboxEventRowSchema>

export const notificationProcessingCheckpointRowSchema = z.object({
  idempotency_key: z.string().min(1),
  checkpoint_key: z.string().min(1),
  created_at: z.string().datetime(),
})

export type NotificationProcessingCheckpointRow = z.infer<
  typeof notificationProcessingCheckpointRowSchema
>

export const notificationReminderScheduleRowSchema = z.object({
  id: z.string().uuid(),
  interview_id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  reminder_due_at: z.string().datetime(),
  status: reminderScheduleStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type NotificationReminderScheduleRow = z.infer<
  typeof notificationReminderScheduleRowSchema
>

export type InterviewState = {
  id: string
  scheduler_id: string
  interviewer_id: string | null
  type: string
  mode: string
  tier: string
  status: string
  scheduled_at: string
  created_at: string
  updated_at: string
}
