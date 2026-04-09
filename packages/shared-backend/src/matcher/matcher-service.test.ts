import { describe, expect, it } from 'vitest'
import {
  arePairingCandidatesEligible,
  MatcherService,
} from './matcher-service'
import type { MatcherCandidateRow } from './types'

describe('MatcherService', function matcherServiceSuite() {
  it('generates deterministic pair attempt ordering by age then ids', function shouldOrderByFairness() {
    const service = new MatcherService()
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

    const pairAttempts = service.buildDeterministicPairAttempts(candidateRows)

    expect(pairAttempts.map(function mapToAttemptKey(pairAttempt) {
      return pairAttempt.attempt_key
    })).toEqual([
      '11111111-1111-4111-8111-111111111111:a1111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222:a2222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111:a1111111-1111-4111-8111-111111111111|33333333-3333-4333-8333-333333333333:a3333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222:a2222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333:a3333333-3333-4333-8333-333333333333',
    ])
  })

  it('applies eligibility constraints for users types overlap and slot model', function shouldApplyPairingRules() {
    const baseCandidate = createCandidateRow({
      requestId: '11111111-1111-4111-8111-111111111111',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      requestCreatedAt: '2026-03-30T09:00:00.000Z',
      slotId: 'a1111111-1111-4111-8111-111111111111',
      interviewType: 'coding',
      slotStartTime: '2026-04-10T10:00:00.000Z',
      slotEndTime: '2026-04-10T11:00:00.000Z',
    })

    const sameUserCandidate = createCandidateRow({
      requestId: '22222222-2222-4222-8222-222222222222',
      userId: baseCandidate.request_user_id,
      requestCreatedAt: '2026-03-30T09:01:00.000Z',
      slotId: 'a2222222-2222-4222-8222-222222222222',
      interviewType: 'coding',
      slotStartTime: '2026-04-10T10:15:00.000Z',
      slotEndTime: '2026-04-10T11:15:00.000Z',
    })

    const differentTypeCandidate = createCandidateRow({
      requestId: '33333333-3333-4333-8333-333333333333',
      userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      requestCreatedAt: '2026-03-30T09:02:00.000Z',
      slotId: 'a3333333-3333-4333-8333-333333333333',
      interviewType: 'behavioral',
      slotStartTime: '2026-04-10T10:15:00.000Z',
      slotEndTime: '2026-04-10T11:15:00.000Z',
    })

    const nonOverlappingCandidate = createCandidateRow({
      requestId: '44444444-4444-4444-8444-444444444444',
      userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      requestCreatedAt: '2026-03-30T09:03:00.000Z',
      slotId: 'a4444444-4444-4444-8444-444444444444',
      interviewType: 'coding',
      slotStartTime: '2026-04-10T12:00:00.000Z',
      slotEndTime: '2026-04-10T13:00:00.000Z',
    })

    const invalidDurationCandidate = createCandidateRow({
      requestId: '55555555-5555-4555-8555-555555555555',
      userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      requestCreatedAt: '2026-03-30T09:04:00.000Z',
      slotId: 'a5555555-5555-4555-8555-555555555555',
      interviewType: 'coding',
      slotStartTime: '2026-04-10T10:15:00.000Z',
      slotEndTime: '2026-04-10T10:45:00.000Z',
    })

    const validCandidate = createCandidateRow({
      requestId: '66666666-6666-4666-8666-666666666666',
      userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      requestCreatedAt: '2026-03-30T09:05:00.000Z',
      slotId: 'a6666666-6666-4666-8666-666666666666',
      interviewType: 'coding',
      slotStartTime: '2026-04-10T10:20:00.000Z',
      slotEndTime: '2026-04-10T11:20:00.000Z',
    })

    expect(arePairingCandidatesEligible(baseCandidate, sameUserCandidate)).toBe(false)
    expect(arePairingCandidatesEligible(baseCandidate, differentTypeCandidate)).toBe(
      false,
    )
    expect(
      arePairingCandidatesEligible(baseCandidate, nonOverlappingCandidate),
    ).toBe(false)
    expect(
      arePairingCandidatesEligible(baseCandidate, invalidDurationCandidate),
    ).toBe(false)
    expect(arePairingCandidatesEligible(baseCandidate, validCandidate)).toBe(true)
  })

  it('returns the same pair-attempt order for the same input state', function shouldBeStableAcrossReruns() {
    const service = new MatcherService()
    const baselineRows = [
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
      createCandidateRow({
        requestId: '33333333-3333-4333-8333-333333333333',
        userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        requestCreatedAt: '2026-04-01T09:00:00.000Z',
        slotId: 'a3333333-3333-4333-8333-333333333333',
        slotStartTime: '2026-04-10T10:15:00.000Z',
        slotEndTime: '2026-04-10T11:15:00.000Z',
      }),
    ]

    const firstRun = service.buildDeterministicPairAttempts(baselineRows)
    const secondRun = service.buildDeterministicPairAttempts([...baselineRows].reverse())

    expect(
      firstRun.map(function mapToAttemptKey(pairAttempt) {
        return pairAttempt.attempt_key
      }),
    ).toEqual(
      secondRun.map(function mapToAttemptKey(pairAttempt) {
        return pairAttempt.attempt_key
      }),
    )
  })

  it('prevents self-matching across multiple slots from the same request', function shouldPreventSelfMatchPairs() {
    const service = new MatcherService()
    const firstSlotSameRequest = createCandidateRow({
      requestId: '11111111-1111-4111-8111-111111111111',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      requestCreatedAt: '2026-03-30T09:00:00.000Z',
      slotId: 'a1111111-1111-4111-8111-111111111111',
      slotStartTime: '2026-04-10T10:00:00.000Z',
      slotEndTime: '2026-04-10T11:00:00.000Z',
    })
    const secondSlotSameRequest = createCandidateRow({
      requestId: firstSlotSameRequest.request_id,
      userId: firstSlotSameRequest.request_user_id,
      requestCreatedAt: firstSlotSameRequest.request_created_at,
      slotId: 'a2222222-2222-4222-8222-222222222222',
      slotStartTime: '2026-04-10T10:15:00.000Z',
      slotEndTime: '2026-04-10T11:15:00.000Z',
    })
    const distinctRequestCandidate = createCandidateRow({
      requestId: '33333333-3333-4333-8333-333333333333',
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      requestCreatedAt: '2026-03-30T09:00:00.000Z',
      slotId: 'a3333333-3333-4333-8333-333333333333',
      slotStartTime: '2026-04-10T10:30:00.000Z',
      slotEndTime: '2026-04-10T11:30:00.000Z',
    })

    const pairAttempts = service.buildDeterministicPairAttempts([
      firstSlotSameRequest,
      secondSlotSameRequest,
      distinctRequestCandidate,
    ])

    expect(pairAttempts.map(function mapToAttemptKey(pairAttempt) {
      return pairAttempt.attempt_key
    })).toEqual([
      '11111111-1111-4111-8111-111111111111:a1111111-1111-4111-8111-111111111111|33333333-3333-4333-8333-333333333333:a3333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111:a2222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333:a3333333-3333-4333-8333-333333333333',
    ])
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
