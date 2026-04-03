import {
  matcherPairAttemptSchema,
  type MatcherCandidateRow,
  type MatcherPairAttempt,
} from './types'

export class MatcherService {
  buildDeterministicPairAttempts(
    candidateRows: readonly MatcherCandidateRow[],
  ): MatcherPairAttempt[] {
    const candidates = [...candidateRows].sort(compareCandidates)
    const pairAttempts: MatcherPairAttempt[] = []

    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      const leftCandidate = candidates[leftIndex]

      if (!leftCandidate) {
        continue
      }

      for (
        let rightIndex = leftIndex + 1;
        rightIndex < candidates.length;
        rightIndex += 1
      ) {
        const rightCandidate = candidates[rightIndex]

        if (!rightCandidate) {
          continue
        }

        if (!arePairingCandidatesEligible(leftCandidate, rightCandidate)) {
          continue
        }

        pairAttempts.push(
          matcherPairAttemptSchema.parse({
            attempt_key: buildAttemptKey(leftCandidate, rightCandidate),
            left: leftCandidate,
            right: rightCandidate,
          }),
        )
      }
    }

    return pairAttempts
  }
}

export function arePairingCandidatesEligible(
  leftCandidate: MatcherCandidateRow,
  rightCandidate: MatcherCandidateRow,
): boolean {
  if (leftCandidate.request_user_id === rightCandidate.request_user_id) {
    return false
  }

  if (leftCandidate.interview_type !== rightCandidate.interview_type) {
    return false
  }

  if (!isExactSixtyMinuteSlot(leftCandidate)) {
    return false
  }

  if (!isExactSixtyMinuteSlot(rightCandidate)) {
    return false
  }

  const leftStartTime = toEpochMilliseconds(leftCandidate.slot_start_time)
  const leftEndTime = toEpochMilliseconds(leftCandidate.slot_end_time)
  const rightStartTime = toEpochMilliseconds(rightCandidate.slot_start_time)
  const rightEndTime = toEpochMilliseconds(rightCandidate.slot_end_time)

  return leftStartTime < rightEndTime && leftEndTime > rightStartTime
}

function compareCandidates(
  leftCandidate: MatcherCandidateRow,
  rightCandidate: MatcherCandidateRow,
): number {
  const createdAtComparison =
    toEpochMilliseconds(leftCandidate.request_created_at) -
    toEpochMilliseconds(rightCandidate.request_created_at)

  if (createdAtComparison !== 0) {
    return createdAtComparison
  }

  const requestIdComparison = leftCandidate.request_id.localeCompare(
    rightCandidate.request_id,
  )

  if (requestIdComparison !== 0) {
    return requestIdComparison
  }

  const slotStartComparison =
    toEpochMilliseconds(leftCandidate.slot_start_time) -
    toEpochMilliseconds(rightCandidate.slot_start_time)

  if (slotStartComparison !== 0) {
    return slotStartComparison
  }

  return leftCandidate.slot_id.localeCompare(rightCandidate.slot_id)
}

function isExactSixtyMinuteSlot(candidate: MatcherCandidateRow): boolean {
  const startTime = toEpochMilliseconds(candidate.slot_start_time)
  const endTime = toEpochMilliseconds(candidate.slot_end_time)
  const sixtyMinutesInMilliseconds = 60 * 60 * 1000

  return endTime - startTime === sixtyMinutesInMilliseconds
}

function toEpochMilliseconds(timestampIso: string): number {
  const parsedTimestamp = Date.parse(timestampIso)

  if (Number.isNaN(parsedTimestamp)) {
    throw new Error(`Invalid timestamp: ${timestampIso}`)
  }

  return parsedTimestamp
}

function buildAttemptKey(
  leftCandidate: MatcherCandidateRow,
  rightCandidate: MatcherCandidateRow,
): string {
  return `${leftCandidate.request_id}:${leftCandidate.slot_id}|${rightCandidate.request_id}:${rightCandidate.slot_id}`
}
