import {
  availabilityRequestStatusSchema,
  availabilitySlotStatusSchema,
  interviewTypeSchema,
  type InterviewType,
} from '../database/foundation-schemas'
import { z } from 'zod'

const timestampSchema = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .transform(function toIsoTimestamp(value) {
    return value instanceof Date ? value.toISOString() : value
  })

export const matcherCandidateRowSchema = z.object({
  slot_id: z.string().uuid(),
  request_id: z.string().uuid(),
  user_id: z.string().uuid(),
  interview_type: interviewTypeSchema,
  request_created_at: timestampSchema,
  request_max_matches: z.number().int().positive(),
  request_current_matches: z.number().int().nonnegative(),
  request_status: availabilityRequestStatusSchema,
  slot_start_time: timestampSchema,
  slot_end_time: timestampSchema,
  slot_status: availabilitySlotStatusSchema,
})

export type MatcherCandidateRow = z.infer<typeof matcherCandidateRowSchema>

export type MatcherCandidateSlot = {
  slotId: string
  requestId: string
  userId: string
  interviewType: InterviewType
  requestCreatedAt: string
  requestMaxMatches: number
  requestCurrentMatches: number
  requestStatus: z.infer<typeof availabilityRequestStatusSchema>
  slotStartTime: string
  slotEndTime: string
  slotStatus: z.infer<typeof availabilitySlotStatusSchema>
}

export type MatchPairAttempt = {
  slotAId: string
  slotBId: string
}

export type MatchSkipReason =
  | 'invalid_pair'
  | 'ineligible_after_lock'
  | 'stale_write_conflict'

export type MatchAttemptResult =
  | {
      outcome: 'matched'
      fulfilledRequestIds: string[]
      cancelledSlotIds: string[]
    }
  | {
      outcome: 'skipped'
      reason: MatchSkipReason
    }

export type RunMatchCycleInput = {
  nowIso?: string
}

export type RunMatchCycleSummary = {
  slotsScanned: number
  pairsAttempted: number
  matchesCreated: number
  skippedPairs: number
  fulfilledRequests: number
  cancelledSlots: number
}

export function toMatcherCandidateSlot(rowInput: unknown): MatcherCandidateSlot {
  const row = matcherCandidateRowSchema.parse(rowInput)

  return {
    slotId: row.slot_id,
    requestId: row.request_id,
    userId: row.user_id,
    interviewType: row.interview_type,
    requestCreatedAt: row.request_created_at,
    requestMaxMatches: row.request_max_matches,
    requestCurrentMatches: row.request_current_matches,
    requestStatus: row.request_status,
    slotStartTime: row.slot_start_time,
    slotEndTime: row.slot_end_time,
    slotStatus: row.slot_status,
  }
}
