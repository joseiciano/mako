import type {
  MatchAttemptResult,
  MatchPairAttempt,
  MatcherCandidateSlot,
  RunMatchCycleInput,
  RunMatchCycleSummary,
} from './types'

export type MatcherServiceRepository = {
  listCandidates(input: { nowIso: string }): Promise<MatcherCandidateSlot[]>
  executePairAttempt(input: MatchPairAttempt): Promise<MatchAttemptResult>
}

export class MatcherService {
  constructor(private readonly matcherRepository: MatcherServiceRepository) {}

  async runMatchCycle(
    input: RunMatchCycleInput = {},
  ): Promise<RunMatchCycleSummary> {
    const nowIso = input.nowIso ?? new Date().toISOString()
    const candidates = await this.matcherRepository.listCandidates({ nowIso })
    const pairAttempts = buildDeterministicPairAttempts(candidates)

    const summary: RunMatchCycleSummary = {
      slotsScanned: candidates.length,
      pairsAttempted: 0,
      matchesCreated: 0,
      skippedPairs: 0,
      fulfilledRequests: 0,
      cancelledSlots: 0,
    }

    for (const pairAttempt of pairAttempts) {
      summary.pairsAttempted += 1

      const result = await this.matcherRepository.executePairAttempt(pairAttempt)

      if (result.outcome === 'matched') {
        summary.matchesCreated += 1
        summary.fulfilledRequests += result.fulfilledRequestIds.length
        summary.cancelledSlots += result.cancelledSlotIds.length
        continue
      }

      summary.skippedPairs += 1
    }

    return summary
  }
}

export function buildDeterministicPairAttempts(
  candidates: readonly MatcherCandidateSlot[],
): MatchPairAttempt[] {
  const pairAttempts: MatchPairAttempt[] = []

  for (let indexA = 0; indexA < candidates.length; indexA += 1) {
    const candidateA = candidates[indexA]

    if (!candidateA) {
      continue
    }

    for (let indexB = indexA + 1; indexB < candidates.length; indexB += 1) {
      const candidateB = candidates[indexB]

      if (!candidateB) {
        continue
      }

      if (candidateA.requestId === candidateB.requestId) {
        continue
      }

      if (candidateA.userId === candidateB.userId) {
        continue
      }

      if (candidateA.interviewType !== candidateB.interviewType) {
        continue
      }

      if (
        !slotsOverlap(
          candidateA.slotStartTime,
          candidateA.slotEndTime,
          candidateB.slotStartTime,
          candidateB.slotEndTime,
        )
      ) {
        continue
      }

      pairAttempts.push({
        slotAId: candidateA.slotId,
        slotBId: candidateB.slotId,
      })
    }
  }

  return pairAttempts
}

function slotsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA < endB && endA > startB
}
