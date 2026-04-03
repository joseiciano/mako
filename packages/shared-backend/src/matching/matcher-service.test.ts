import { describe, expect, it } from 'vitest'
import {
  MatcherService,
  buildDeterministicPairAttempts,
  type MatcherServiceRepository,
} from './matcher-service'
import type {
  MatchPairAttempt,
  MatcherCandidateSlot,
  MatchSkipReason,
} from './types'

const nowIso = '2026-04-02T09:00:00.000Z'

describe('MatcherService', function matcherServiceSuite() {
  it('prevents redundant matches from fulfilled requests in same and future runs', async function shouldPreventRedundantMatches() {
    const repository = createInMemoryMatcherRepository({
      requests: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewType: 'coding',
          status: 'active',
          currentMatches: 0,
          maxMatches: 1,
          createdAt: '2026-04-01T08:00:00.000Z',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          interviewType: 'coding',
          status: 'active',
          currentMatches: 0,
          maxMatches: 2,
          createdAt: '2026-04-01T09:00:00.000Z',
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          interviewType: 'coding',
          status: 'active',
          currentMatches: 0,
          maxMatches: 2,
          createdAt: '2026-04-01T10:00:00.000Z',
        },
      ],
      slots: [
        {
          id: 'aaaaaaaa-1111-4111-8111-111111111111',
          requestId: '11111111-1111-4111-8111-111111111111',
          startTime: '2026-04-02T10:00:00.000Z',
          endTime: '2026-04-02T11:00:00.000Z',
          status: 'available',
        },
        {
          id: 'aaaaaaaa-2222-4222-8222-222222222222',
          requestId: '11111111-1111-4111-8111-111111111111',
          startTime: '2026-04-02T12:00:00.000Z',
          endTime: '2026-04-02T13:00:00.000Z',
          status: 'available',
        },
        {
          id: 'bbbbbbbb-1111-4111-8111-111111111111',
          requestId: '22222222-2222-4222-8222-222222222222',
          startTime: '2026-04-02T10:00:00.000Z',
          endTime: '2026-04-02T11:00:00.000Z',
          status: 'available',
        },
        {
          id: 'cccccccc-1111-4111-8111-111111111111',
          requestId: '33333333-3333-4333-8333-333333333333',
          startTime: '2026-04-02T12:00:00.000Z',
          endTime: '2026-04-02T13:00:00.000Z',
          status: 'available',
        },
      ],
    })

    const service = new MatcherService(repository)

    const firstRunSummary = await service.runMatchCycle({ nowIso })

    expect(firstRunSummary).toEqual({
      slotsScanned: 4,
      pairsAttempted: 2,
      matchesCreated: 1,
      skippedPairs: 1,
      fulfilledRequests: 1,
      cancelledSlots: 1,
    })

    expect(repository.getRequestState('11111111-1111-4111-8111-111111111111')).toMatchObject(
      {
        status: 'fulfilled',
        currentMatches: 1,
      },
    )

    expect(repository.getSlotState('aaaaaaaa-2222-4222-8222-222222222222')).toBe(
      'cancelled',
    )

    const secondRunSummary = await service.runMatchCycle({ nowIso })

    expect(secondRunSummary.matchesCreated).toBe(0)
    expect(secondRunSummary.pairsAttempted).toBe(0)
  })

  it('buildDeterministicPairAttempts preserves stable pair order', function shouldBuildStablePairOrder() {
    const candidates: MatcherCandidateSlot[] = [
      createCandidate({
        slotId: 'slot-1',
        requestId: 'request-1',
        userId: 'user-1',
        start: '2026-04-02T10:00:00.000Z',
        end: '2026-04-02T11:00:00.000Z',
      }),
      createCandidate({
        slotId: 'slot-2',
        requestId: 'request-2',
        userId: 'user-2',
        start: '2026-04-02T10:00:00.000Z',
        end: '2026-04-02T11:00:00.000Z',
      }),
      createCandidate({
        slotId: 'slot-3',
        requestId: 'request-3',
        userId: 'user-3',
        start: '2026-04-02T10:00:00.000Z',
        end: '2026-04-02T11:00:00.000Z',
      }),
    ]

    const pairAttempts = buildDeterministicPairAttempts(candidates)

    expect(pairAttempts).toEqual([
      { slotAId: 'slot-1', slotBId: 'slot-2' },
      { slotAId: 'slot-1', slotBId: 'slot-3' },
      { slotAId: 'slot-2', slotBId: 'slot-3' },
    ])
  })
})

type RequestState = {
  id: string
  userId: string
  interviewType: 'system_design' | 'coding' | 'behavioral'
  status: 'active' | 'fulfilled' | 'cancelled'
  currentMatches: number
  maxMatches: number
  createdAt: string
}

type SlotState = {
  id: string
  requestId: string
  startTime: string
  endTime: string
  status: 'available' | 'matched' | 'cancelled'
}

function createInMemoryMatcherRepository(input: {
  requests: RequestState[]
  slots: SlotState[]
}): MatcherServiceRepository & {
  getRequestState(requestId: string): RequestState | undefined
  getSlotState(slotId: string): SlotState['status'] | undefined
} {
  const requests = new Map(
    input.requests.map(function toEntry(request) {
      return [request.id, { ...request }]
    }),
  )

  const slots = new Map(
    input.slots.map(function toEntry(slot) {
      return [slot.id, { ...slot }]
    }),
  )

  return {
    async listCandidates({ nowIso }) {
      return Array.from(slots.values())
        .filter(function isEligibleSlot(slot) {
          const request = requests.get(slot.requestId)

          if (!request) {
            return false
          }

          return (
            slot.status === 'available' &&
            request.status === 'active' &&
            request.currentMatches < request.maxMatches &&
            slot.startTime > nowIso
          )
        })
        .map(function toCandidate(slot) {
          const request = requests.get(slot.requestId)

          if (!request) {
            throw new Error('Request was expected in in-memory repository')
          }

          return {
            slotId: slot.id,
            requestId: request.id,
            userId: request.userId,
            interviewType: request.interviewType,
            requestCreatedAt: request.createdAt,
            requestMaxMatches: request.maxMatches,
            requestCurrentMatches: request.currentMatches,
            requestStatus: request.status,
            slotStartTime: slot.startTime,
            slotEndTime: slot.endTime,
            slotStatus: slot.status,
          }
        })
        .sort(compareCandidates)
    },

    async executePairAttempt(pairAttempt: MatchPairAttempt) {
      const slotA = slots.get(pairAttempt.slotAId)
      const slotB = slots.get(pairAttempt.slotBId)

      if (!slotA || !slotB || slotA.id === slotB.id) {
        return {
          outcome: 'skipped',
          reason: 'invalid_pair' as MatchSkipReason,
        }
      }

      const requestA = requests.get(slotA.requestId)
      const requestB = requests.get(slotB.requestId)

      if (!requestA || !requestB || requestA.id === requestB.id) {
        return {
          outcome: 'skipped',
          reason: 'invalid_pair' as MatchSkipReason,
        }
      }

      if (
        slotA.status !== 'available' ||
        slotB.status !== 'available' ||
        requestA.status !== 'active' ||
        requestB.status !== 'active' ||
        requestA.currentMatches >= requestA.maxMatches ||
        requestB.currentMatches >= requestB.maxMatches ||
        requestA.userId === requestB.userId ||
        requestA.interviewType !== requestB.interviewType ||
        !slotsOverlap(slotA.startTime, slotA.endTime, slotB.startTime, slotB.endTime)
      ) {
        return {
          outcome: 'skipped',
          reason: 'ineligible_after_lock' as MatchSkipReason,
        }
      }

      slotA.status = 'matched'
      slotB.status = 'matched'
      requestA.currentMatches += 1
      requestB.currentMatches += 1

      const fulfilledRequestIds: string[] = []
      const requestsToCheck = [requestA, requestB]

      for (const request of requestsToCheck) {
        if (request.currentMatches < request.maxMatches) {
          continue
        }

        request.status = 'fulfilled'
        fulfilledRequestIds.push(request.id)
      }

      const cancelledSlotIds: string[] = []

      for (const slot of slots.values()) {
        if (
          fulfilledRequestIds.includes(slot.requestId) &&
          slot.status === 'available'
        ) {
          slot.status = 'cancelled'
          cancelledSlotIds.push(slot.id)
        }
      }

      return {
        outcome: 'matched' as const,
        fulfilledRequestIds,
        cancelledSlotIds,
      }
    },

    getRequestState(requestId: string) {
      const request = requests.get(requestId)
      return request ? { ...request } : undefined
    },

    getSlotState(slotId: string) {
      return slots.get(slotId)?.status
    },
  }
}

function createCandidate(input: {
  slotId: string
  requestId: string
  userId: string
  start: string
  end: string
}): MatcherCandidateSlot {
  return {
    slotId: input.slotId,
    requestId: input.requestId,
    userId: input.userId,
    interviewType: 'coding',
    requestCreatedAt: '2026-04-01T08:00:00.000Z',
    requestMaxMatches: 2,
    requestCurrentMatches: 0,
    requestStatus: 'active',
    slotStartTime: input.start,
    slotEndTime: input.end,
    slotStatus: 'available',
  }
}

function compareCandidates(
  candidateA: MatcherCandidateSlot,
  candidateB: MatcherCandidateSlot,
): number {
  if (candidateA.requestCreatedAt !== candidateB.requestCreatedAt) {
    return candidateA.requestCreatedAt < candidateB.requestCreatedAt ? -1 : 1
  }

  if (candidateA.requestId !== candidateB.requestId) {
    return candidateA.requestId < candidateB.requestId ? -1 : 1
  }

  if (candidateA.slotStartTime !== candidateB.slotStartTime) {
    return candidateA.slotStartTime < candidateB.slotStartTime ? -1 : 1
  }

  if (candidateA.slotId === candidateB.slotId) {
    return 0
  }

  return candidateA.slotId < candidateB.slotId ? -1 : 1
}

function slotsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA < endB && endA > startB
}
