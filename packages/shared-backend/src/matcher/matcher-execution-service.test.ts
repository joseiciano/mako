import { describe, expect, it } from 'vitest'
import { MatcherExecutionService } from './matcher-execution-service'
import type { MatcherCandidateRow } from './types'

describe('MatcherExecutionService', function matcherExecutionServiceSuite() {
  it('runs deterministic pair attempts and summarizes write outcomes', async function shouldRunMatchCycle() {
    const candidateRows = [
      createCandidateRow({
        requestId: '33333333-3333-4333-8333-333333333333',
        userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        requestCreatedAt: '2026-04-01T09:00:00.000Z',
        slotId: 'a3333333-3333-4333-8333-333333333333',
        slotStartTime: '2026-04-10T10:15:00.000Z',
        slotEndTime: '2026-04-10T11:15:00.000Z',
      }),
      createCandidateRow({
        requestId: '11111111-1111-4111-8111-111111111111',
        userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requestCreatedAt: '2026-03-30T09:00:00.000Z',
        slotId: 'a1111111-1111-4111-8111-111111111111',
        slotStartTime: '2026-04-10T10:00:00.000Z',
        slotEndTime: '2026-04-10T11:00:00.000Z',
      }),
      createCandidateRow({
        requestId: '22222222-2222-4222-8222-222222222222',
        userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        requestCreatedAt: '2026-03-30T09:00:00.000Z',
        slotId: 'a2222222-2222-4222-8222-222222222222',
        slotStartTime: '2026-04-10T10:30:00.000Z',
        slotEndTime: '2026-04-10T11:30:00.000Z',
      }),
    ]

    const attemptedPairKeys: string[] = []
    const executionService = new MatcherExecutionService({
      async listCandidateRows() {
        return candidateRows
      },
      async executePairAttemptTransaction(pairAttempt) {
        attemptedPairKeys.push(pairAttempt.attempt_key)

        if (
          pairAttempt.attempt_key ===
          '11111111-1111-4111-8111-111111111111:a1111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222:a2222222-2222-4222-8222-222222222222'
        ) {
          return {
            status: 'created',
            interviewId: '99999999-9999-4999-8999-999999999999',
          }
        }

        return {
          status: 'skipped',
          reason: 'request_quota_reached',
        }
      },
    })

    const result = await executionService.runMatchCycle()

    expect(attemptedPairKeys).toEqual([
      '11111111-1111-4111-8111-111111111111:a1111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222:a2222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111:a1111111-1111-4111-8111-111111111111|33333333-3333-4333-8333-333333333333:a3333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222:a2222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333:a3333333-3333-4333-8333-333333333333',
    ])
    expect(result).toEqual({
      candidateCount: 3,
      pairAttemptCount: 3,
      matchesCreated: 1,
      skippedAttempts: 2,
      createdInterviewIds: ['99999999-9999-4999-8999-999999999999'],
    })
  })
})

function createCandidateRow(input: {
  requestId: string
  userId: string
  requestCreatedAt: string
  slotId: string
  interviewType?: 'system_design' | 'coding' | 'behavioral'
  slotStartTime: string
  slotEndTime: string
}): MatcherCandidateRow {
  return {
    request_id: input.requestId,
    request_user_id: input.userId,
    request_created_at: input.requestCreatedAt,
    interview_type: input.interviewType ?? 'system_design',
    slot_id: input.slotId,
    slot_start_time: input.slotStartTime,
    slot_end_time: input.slotEndTime,
  }
}
