import { z } from 'zod'
import { interviewTypeSchema } from './interviews'

export const availabilitySlotInputSchema = z
  .object({
    start_time: z.string().datetime({ offset: true }),
    end_time: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    function slotIsExactlySixtyMinutes(slot) {
      const startMs = new Date(slot.start_time).getTime()
      const endMs = new Date(slot.end_time).getTime()
      return endMs - startMs === 60 * 60 * 1000
    },
    {
      message: 'Each slot must be exactly 60 minutes.',
    },
  )
  .refine(
    function startTimeBeforeEndTime(slot) {
      return new Date(slot.start_time).getTime() < new Date(slot.end_time).getTime()
    },
    {
      message: 'start_time must be before end_time.',
    },
  )
export const maxAvailabilitySlotsPerRequest = 200
export const createAvailabilityRequestSchema = z
  .object({
    interview_type: interviewTypeSchema,
    max_matches: z.number().int().positive(),
    slots: z.array(availabilitySlotInputSchema).min(1).max(maxAvailabilitySlotsPerRequest),
  })
  .strict()

export const availabilityRequestSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  interview_type: interviewTypeSchema,
  max_matches: z.number().int().positive(),
  current_matches: z.number().int().nonnegative(),
  status: z.enum(['active', 'fulfilled', 'cancelled']),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})

export const availabilitySlotSchema = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  status: z.enum(['available', 'matched', 'cancelled']),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})

export const createAvailabilityResponseSchema = z.object({
  request: availabilityRequestSchema,
  slots: z.array(availabilitySlotSchema),
})

export type AvailabilitySlotInput = z.infer<typeof availabilitySlotInputSchema>
export type CreateAvailabilityRequest = z.infer<typeof createAvailabilityRequestSchema>
export type AvailabilityRequest = z.infer<typeof availabilityRequestSchema>
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>
export type CreateAvailabilityResponse = z.infer<typeof createAvailabilityResponseSchema>
