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
import type {
  NotificationService,
  NotificationDispatchService,
  NotificationTransport,
} from '../notifications'
import type { NotificationOutboxEventRow } from '../notifications/notification-types'

export type MatcherExecutionRepository = {
  listCandidateRows(): Promise<MatcherCandidateRow[]>
  executePairAttemptTransaction(
    pairAttempt: MatcherPairAttempt,
    buildOutboxEvent?: (interview: MatcherCreatedInterview) => NotificationOutboxEventRow,
  ): Promise<MatchAttemptWriteResult>
}

export type MatcherExecutionLogger = {
  info(event: string, context: Record<string, unknown>): void | Promise<void>
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

export type MatcherRunSummary = {
  slotsScanned: number
  pairsAttempted: number
  matchesCreated: number
  skippedAttempts: number
  transactionConflicts: number
  transactionRetries: number
  createdInterviewIds: string[]
}

type MatcherExecutionServiceDependencies = {
  postCommitEventPublisher?: MatcherPostCommitEventPublisher
  buildMatchCreatedEvent?: (input: {
    interview: MatcherCreatedInterview
  }) => MatcherMatchCreatedEvent
  logger?: MatcherExecutionLogger
  createRunId?: () => string
  notificationService?: NotificationService
  notificationDispatchService?: NotificationDispatchService
  notificationTransport?: NotificationTransport
}

export class MatcherExecutionService {
  private readonly postCommitEventPublisher?: MatcherPostCommitEventPublisher

  private readonly buildMatchCreatedEvent: (input: {
    interview: MatcherCreatedInterview
  }) => MatcherMatchCreatedEvent

  private readonly logger: MatcherExecutionLogger

  private readonly createRunId: () => string

  private readonly notificationService?: NotificationService

  private readonly notificationDispatchService?: NotificationDispatchService

  private readonly notificationTransport?: NotificationTransport

  constructor(
    private readonly matcherRepository: MatcherExecutionRepository,
    private readonly matcherService: MatcherService = new MatcherService(),
    dependencies: MatcherExecutionServiceDependencies = {},
  ) {
    this.postCommitEventPublisher = dependencies.postCommitEventPublisher
    this.buildMatchCreatedEvent =
      dependencies.buildMatchCreatedEvent ?? buildMatcherMatchCreatedEvent
    this.logger = dependencies.logger ?? noOpMatcherExecutionLogger
    this.createRunId = dependencies.createRunId ?? createDefaultRunId
    this.notificationService = dependencies.notificationService
    this.notificationDispatchService = dependencies.notificationDispatchService
    this.notificationTransport = dependencies.notificationTransport
  }

  async runMatchCycle(): Promise<MatcherRunSummary> {
    const runId = this.createRunId()
    const candidateRows = await this.matcherRepository.listCandidateRows()
    const pairAttempts = this.matcherService.buildDeterministicPairAttempts(candidateRows)
    const createdInterviewIds: string[] = []
    let skippedAttempts = 0
    let transactionConflicts = 0
    let transactionRetries = 0

    await this.logSafely('info', 'matcher.run.started', {
      run_id: runId,
      slots_scanned: candidateRows.length,
      pairs_attempted: pairAttempts.length,
    })

    for (const pairAttempt of pairAttempts) {
      const buildOutboxEvent = this.notificationService
        ? (interview: MatcherCreatedInterview) => {
            const event = this.buildMatchCreatedEvent({ interview })
            return {
              idempotency_key: event.idempotency_key,
              event_type: event.event_type,
              event_payload: event as unknown as Record<string, unknown>,
              status: 'pending' as const,
              dispatch_attempts: 0,
              last_dispatch_attempted_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          }
        : undefined

      const writeResult = await this.matcherRepository.executePairAttemptTransaction(
        pairAttempt,
        buildOutboxEvent,
      )

      transactionConflicts += writeResult.diagnostics.transactionConflicts
      transactionRetries += writeResult.diagnostics.transactionRetries

      if (writeResult.status === 'created') {
        const matchCreatedEvent = this.buildMatchCreatedEvent({
          interview: writeResult.interview,
        })

        if (this.notificationDispatchService && this.notificationTransport) {
          try {
            await this.notificationDispatchService.dispatchOutboxEventByIdempotencyKey(
              matchCreatedEvent.idempotency_key,
              this.notificationTransport,
            )
          } catch (error) {
            await this.logSafely('error', 'matcher.run.post_commit_dispatch_failure', {
              run_id: runId,
              attempt_key: pairAttempt.attempt_key,
              slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
              request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
              interview_id: writeResult.interviewId,
              error_message: toErrorMessage(error),
            })
          }
        } else if (this.postCommitEventPublisher) {
          try {
            await this.postCommitEventPublisher.publish(matchCreatedEvent)
          } catch (error) {
            await this.logSafely('error', 'matcher.run.post_commit_publish_failure', {
              run_id: runId,
              attempt_key: pairAttempt.attempt_key,
              slot_ids: [pairAttempt.left.slot_id, pairAttempt.right.slot_id],
              request_ids: [pairAttempt.left.request_id, pairAttempt.right.request_id],
              interview_id: writeResult.interviewId,
              error_message: toErrorMessage(error),
            })
          }
        }

        createdInterviewIds.push(writeResult.interviewId)
        continue
      }

      skippedAttempts += 1
    }

    const summary: MatcherRunSummary = {
      slotsScanned: candidateRows.length,
      pairsAttempted: pairAttempts.length,
      matchesCreated: createdInterviewIds.length,
      skippedAttempts,
      transactionConflicts,
      transactionRetries,
      createdInterviewIds,
    }

    await this.logSafely('info', 'matcher.run.completed', {
      run_id: runId,
      slots_scanned: summary.slotsScanned,
      pairs_attempted: summary.pairsAttempted,
      matches_created: summary.matchesCreated,
      skipped_attempts: summary.skippedAttempts,
      transaction_conflicts: summary.transactionConflicts,
      transaction_retries: summary.transactionRetries,
    })

    return summary
  }

  private async logSafely(
    level: 'info' | 'error',
    event: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.logger[level](event, context)
    } catch {
      // no-op: logging must never block matcher execution
    }
  }
}

const noOpMatcherExecutionLogger: MatcherExecutionLogger = {
  info: async function infoNoOp() {
    return undefined
  },
  error: async function errorNoOp() {
    return undefined
  },
}

function createDefaultRunId(): string {
  return crypto.randomUUID()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
