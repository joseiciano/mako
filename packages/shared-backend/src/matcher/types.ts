import { interviewTypeSchema } from '../database/foundation-schemas'
import { z } from 'zod'

const timestampSchema = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .transform(function normalizeTimestamp(value) {
    return value instanceof Date ? value.toISOString() : value
  })

export const matcherCandidateRowSchema = z.object({
  request_id: z.string().uuid(),
  request_user_id: z.string().uuid(),
  request_created_at: timestampSchema,
  interview_type: interviewTypeSchema,
  slot_id: z.string().uuid(),
  slot_start_time: timestampSchema,
  slot_end_time: timestampSchema,
})

export type MatcherCandidateRow = z.infer<typeof matcherCandidateRowSchema>

export const matcherPairAttemptSchema = z.object({
  attempt_key: z.string().min(1),
  left: matcherCandidateRowSchema,
  right: matcherCandidateRowSchema,
})

export type MatcherPairAttempt = z.infer<typeof matcherPairAttemptSchema>

export const matcherLockedSlotRowSchema = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  start_time: timestampSchema,
  end_time: timestampSchema,
  status: z.enum(['available', 'matched', 'cancelled']),
})

export type MatcherLockedSlotRow = z.infer<typeof matcherLockedSlotRowSchema>

export const matcherLockedRequestRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  created_at: timestampSchema,
  current_matches: z.number().int().nonnegative(),
  max_matches: z.number().int().positive(),
  interview_type: interviewTypeSchema,
  status: z.enum(['active', 'fulfilled', 'cancelled']),
})

export type MatcherLockedRequestRow = z.infer<typeof matcherLockedRequestRowSchema>

export const matcherCreatedInterviewSchema = z.object({
  id: z.string().uuid(),
  scheduler_id: z.string().uuid(),
  interviewer_id: z.string().uuid(),
  type: interviewTypeSchema,
  mode: z.literal('peer_to_peer'),
  tier: z.literal('standard'),
  status: z.literal('scheduled'),
  scheduled_at: timestampSchema,
})

export type MatcherCreatedInterview = z.infer<typeof matcherCreatedInterviewSchema>

export type MatchAttemptWriteSkipReason =
  | 'slots_not_found'
  | 'requests_not_found'
  | 'slot_not_available'
  | 'request_not_active'
  | 'request_quota_reached'
  | 'users_not_distinct'
  | 'interview_type_mismatch'

export type MatchAttemptWriteResult =
  | {
      status: 'created'
      interviewId: string
      interview: MatcherCreatedInterview
    }
  | {
      status: 'skipped'
      reason: MatchAttemptWriteSkipReason
    }

export function parseMatcherCandidateRow(row: unknown): MatcherCandidateRow {
  return matcherCandidateRowSchema.parse(row)
}

export function parseMatcherLockedSlotRow(row: unknown): MatcherLockedSlotRow {
  return matcherLockedSlotRowSchema.parse(row)
}

export function parseMatcherLockedRequestRow(
  row: unknown,
): MatcherLockedRequestRow {
  return matcherLockedRequestRowSchema.parse(row)
}
