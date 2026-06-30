import { z } from 'zod'

export const interviewTierValueSchema = z.enum(['standard', 'premium'])

export type InterviewTier = z.infer<typeof interviewTierValueSchema>

export const interviewCreateConsumptionSchema = z.enum([
  'free_ai_interview',
  'credit',
])

export type InterviewCreateConsumption = z.infer<
  typeof interviewCreateConsumptionSchema
>

export const peerToPeerPaymentSourceSchema = z.enum([
  'free_standard',
  'credit',
])

export type PeerToPeerPaymentSource = z.infer<
  typeof peerToPeerPaymentSourceSchema
>

export type InterviewPolicyConfig = {
  freeAiInterviewTier: InterviewTier
  creditAiInterviewTier: InterviewTier
}

export type ResolvedInterviewCreatePolicy = {
  tier: InterviewTier
  consumption: InterviewCreateConsumption
}

export type UserAccountPolicy = {
  userId: string
  freeStandardInterviews: number
  freeAiInterviews: number
  credits: number
}

export type PeerToPeerUserPayment = {
  userId: string
  source: PeerToPeerPaymentSource
}

export type PeerToPeerPaymentResolution = {
  tier: InterviewTier
  userPayments: PeerToPeerUserPayment[]
}

export class InsufficientCreditsError extends Error {
  constructor(message = 'INSUFFICIENT_CREDITS') {
    super(message)
    this.name = 'InsufficientCreditsError'
  }
}
