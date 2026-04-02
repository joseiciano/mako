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

export function parseMatcherCandidateRow(row: unknown): MatcherCandidateRow {
  return matcherCandidateRowSchema.parse(row)
}
