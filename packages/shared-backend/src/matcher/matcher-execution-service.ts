import {
  buildMatcherMatchCreatedEvent,
  type MatcherMatchCreatedEvent,
  type MatcherPostCommitEventPublisher,
} from './matcher-post-commit-event'
import type {
  MatcherCandidateRow,
  MatcherCreatedInterview,
  MatcherPairAttempt,
  MatchAttemptWriteResult,
} from './types'
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

type MatcherExecutionServiceDependencies = {
  postCommitEventPublisher?: MatcherPostCommitEventPublisher
  buildMatchCreatedEvent?: (input: {
    interview: MatcherCreatedInterview
  }) => MatcherMatchCreatedEvent
}

export class MatcherExecutionService {
  private readonly postCommitEventPublisher: MatcherPostCommitEventPublisher

  private readonly buildMatchCreatedEvent: (input: {
    interview: MatcherCreatedInterview
  }) => MatcherMatchCreatedEvent

  constructor(
    private readonly matcherRepository: MatcherExecutionRepository,
    private readonly matcherService: MatcherService = new MatcherService(),
    dependencies: MatcherExecutionServiceDependencies = {},
  ) {
    this.postCommitEventPublisher =
      dependencies.postCommitEventPublisher ?? missingMatcherPostCommitEventPublisher
    this.buildMatchCreatedEvent =
      dependencies.buildMatchCreatedEvent ?? buildMatcherMatchCreatedEvent
  }

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
        const matchCreatedEvent = this.buildMatchCreatedEvent({
          interview: writeResult.interview,
        })

        await this.postCommitEventPublisher.publish(matchCreatedEvent)
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

const missingMatcherPostCommitEventPublisher: MatcherPostCommitEventPublisher = {
  publish: publishMissingMatcherPostCommitEvent,
}

async function publishMissingMatcherPostCommitEvent(): Promise<void> {
  throw new Error(
    'MatcherExecutionService post-commit event publisher is not configured',
  )
}
