import type { MatcherCandidateRow, MatcherPairAttempt, MatchAttemptWriteResult } from './types'
import { MatcherService } from './matcher-service'

export type MatcherExecutionRepository = {
  listCandidateRows(): Promise<MatcherCandidateRow[]>
  executePairAttemptTransaction(
    pairAttempt: MatcherPairAttempt,
  ): Promise<MatchAttemptWriteResult>
}

export type MatcherRunSummary = {
  candidateCount: number
  pairAttemptCount: number
  matchesCreated: number
  skippedAttempts: number
  createdInterviewIds: string[]
}

export class MatcherExecutionService {
  constructor(
    private readonly matcherRepository: MatcherExecutionRepository,
    private readonly matcherService: MatcherService = new MatcherService(),
  ) {}

  async runMatchCycle(): Promise<MatcherRunSummary> {
    const candidateRows = await this.matcherRepository.listCandidateRows()
    const pairAttempts = this.matcherService.buildDeterministicPairAttempts(candidateRows)
    const createdInterviewIds: string[] = []
    let skippedAttempts = 0

    for (const pairAttempt of pairAttempts) {
      const writeResult = await this.matcherRepository.executePairAttemptTransaction(
        pairAttempt,
      )

      if (writeResult.status === 'created') {
        createdInterviewIds.push(writeResult.interviewId)
        continue
      }

      skippedAttempts += 1
    }

    return {
      candidateCount: candidateRows.length,
      pairAttemptCount: pairAttempts.length,
      matchesCreated: createdInterviewIds.length,
      skippedAttempts,
      createdInterviewIds,
    }
  }
}
