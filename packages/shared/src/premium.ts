import { z } from 'zod'

import { bookingChannelSchema, interviewDetailSchema } from './interviews'

export const premiumSlotStatusSchema = z.enum([
  'available',
  'claimed',
  'cancelled',
])

export const premiumInterviewTypeSchema = z.enum([
  'system_design',
  'coding',
  'behavioral',
])

export const premiumBookingChannelSchema = bookingChannelSchema

export const defaultPremiumListLimit = 25

export const maxPremiumListLimit = 100

export const premiumInterviewerSlotSchema = z.object({
  id: z.string().uuid(),
  interviewerId: z.string().uuid(),
  interviewType: premiumInterviewTypeSchema,
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  status: premiumSlotStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export const publishPremiumSlotInputSchema = z
  .object({
    interviewType: premiumInterviewTypeSchema,
    startTime: z.string().datetime({ offset: true }),
  })
  .strict()

export const premiumPolicyMetadataSchema = z.object({
  leadTimeMinutes: z.number().int().positive(),
  horizonDays: z.number().int().positive(),
  priceCredits: z.literal(1),
})

export const premiumPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(maxPremiumListLimit).default(defaultPremiumListLimit),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export const premiumOwnerListQuerySchema = premiumPaginationQuerySchema
  .extend({
    status: premiumSlotStatusSchema.optional(),
    interviewType: premiumInterviewTypeSchema.optional(),
  })
  .strict()

export const premiumMarketplaceListQuerySchema = premiumPaginationQuerySchema
  .extend({
    interviewType: premiumInterviewTypeSchema.optional(),
  })
  .strict()

export const premiumMarketplaceInterviewerSchema = z.object({
  displayName: z.string().min(1),
  image: z.string().nullable(),
  isVerified: z.literal(true),
})

export const premiumMarketplaceSlotSchema = z.object({
  slotId: z.string().uuid(),
  interviewType: premiumInterviewTypeSchema,
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  interviewer: premiumMarketplaceInterviewerSchema,
})

export const premiumOwnerListResponseSchema = z.object({
  slots: z.array(premiumInterviewerSlotSchema),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  }),
  policy: premiumPolicyMetadataSchema,
})

export const premiumMarketplaceResponseSchema = z.object({
  slots: z.array(premiumMarketplaceSlotSchema),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    hasMore: z.boolean(),
  }),
  policy: premiumPolicyMetadataSchema,
})

export const premiumClaimParamsSchema = z.object({
  id: z.string().uuid(),
})

export const premiumClaimResponseSchema = z.object({
  interview: interviewDetailSchema,
})

export const cancelPremiumSlotResponseSchema = z.object({
  success: z.literal(true),
})

export type PremiumSlotStatus = z.infer<typeof premiumSlotStatusSchema>
export type PremiumInterviewType = z.infer<typeof premiumInterviewTypeSchema>
export type PremiumInterviewerSlot = z.infer<typeof premiumInterviewerSlotSchema>
export type PublishPremiumSlotInput = z.infer<typeof publishPremiumSlotInputSchema>
export type PremiumPolicyMetadata = z.infer<typeof premiumPolicyMetadataSchema>
export type PremiumOwnerListQuery = z.infer<typeof premiumOwnerListQuerySchema>
export type PremiumMarketplaceListQuery = z.infer<typeof premiumMarketplaceListQuerySchema>
export type PremiumMarketplaceInterviewer = z.infer<typeof premiumMarketplaceInterviewerSchema>
export type PremiumMarketplaceSlot = z.infer<typeof premiumMarketplaceSlotSchema>
export type PremiumOwnerListResponse = z.infer<typeof premiumOwnerListResponseSchema>
export type PremiumMarketplaceResponse = z.infer<typeof premiumMarketplaceResponseSchema>
export type PremiumClaimParams = z.infer<typeof premiumClaimParamsSchema>
export type PremiumClaimResponse = z.infer<typeof premiumClaimResponseSchema>
export type CancelPremiumSlotResponse = z.infer<typeof cancelPremiumSlotResponseSchema>
