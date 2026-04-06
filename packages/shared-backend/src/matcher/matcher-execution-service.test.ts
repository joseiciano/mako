import { describe, expect, it } from 'vitest'
import { MatcherExecutionService } from './matcher-execution-service'
import type { MatcherCandidateRow } from './types'

describe('MatcherExecutionService', function matcherExecutionServiceSuite() {
  it('runs deterministic pair attempts, emits post-commit events, and summarizes write outcomes', async function shouldRunMatchCycle() {
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
    const publishedEvents: unknown[] = []
    const logEntries: Array<{ event: string; context: Record<string, unknown> }> = []
    const executionService = new MatcherExecutionService(
      {
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
              interview: {
                id: '99999999-9999-4999-8999-999999999999',
                scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                type: 'system_design',
                mode: 'peer_to_peer',
                tier: 'standard',
                status: 'scheduled',
                scheduled_at: '2026-04-10T10:30:00.000Z',
              },
              diagnostics: {
                transactionConflicts: 0,
                transactionRetries: 0,
              },
            }
          }

          return {
            status: 'skipped',
            reason: 'request_quota_reached',
            diagnostics: {
              transactionConflicts: 0,
              transactionRetries: 0,
            },
          }
        },
      },
      undefined,
      {
        postCommitEventPublisher: {
          async publish(event) {
            publishedEvents.push(event)
          },
        },
        buildMatchCreatedEvent(input) {
          return {
            event_type: 'interview.match.created',
            event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            idempotency_key: `interview.match.created:${input.interview.id}`,
            occurred_at: '2026-04-01T15:00:00.000Z',
            interview: input.interview,
            participants: {
              scheduler_user_id: input.interview.scheduler_id,
              interviewer_user_id: input.interview.interviewer_id,
            },
          }
        },
        logger: {
          async info(event, context) {
            logEntries.push({ event, context })
          },
          async error(event, context) {
            logEntries.push({ event, context })
          },
        },
        createRunId: function createStableRunId() {
          return 'run-1'
        },
      },
    )

    const result = await executionService.runMatchCycle()

    expect(attemptedPairKeys).toEqual([
      '11111111-1111-4111-8111-111111111111:a1111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222:a2222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111:a1111111-1111-4111-8111-111111111111|33333333-3333-4333-8333-333333333333:a3333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222:a2222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333:a3333333-3333-4333-8333-333333333333',
    ])
    expect(result).toEqual({
      slotsScanned: 3,
      pairsAttempted: 3,
      matchesCreated: 1,
      skippedAttempts: 2,
      transactionConflicts: 0,
      transactionRetries: 0,
      createdInterviewIds: ['99999999-9999-4999-8999-999999999999'],
    })

    expect(publishedEvents).toEqual([
      {
        event_type: 'interview.match.created',
        event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        idempotency_key: 'interview.match.created:99999999-9999-4999-8999-999999999999',
        occurred_at: '2026-04-01T15:00:00.000Z',
        interview: {
          id: '99999999-9999-4999-8999-999999999999',
          scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'system_design',
          mode: 'peer_to_peer',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-04-10T10:30:00.000Z',
        },
        participants: {
          scheduler_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          interviewer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      },
    ])

    expect(logEntries).toContainEqual({
      event: 'matcher.run.completed',
      context: {
        run_id: 'run-1',
        slots_scanned: 3,
        pairs_attempted: 3,
        matches_created: 1,
        skipped_attempts: 2,
        transaction_conflicts: 0,
        transaction_retries: 0,
      },
    })
  })

  it('aggregates transaction conflict and retry counters in run summaries', async function shouldSummarizeConflictCounters() {
    const executionService = new MatcherExecutionService(
      {
        async listCandidateRows() {
          return [
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
        },
        async executePairAttemptTransaction() {
          return {
            status: 'skipped',
            reason: 'transaction_conflict',
            diagnostics: {
              transactionConflicts: 1,
              transactionRetries: 1,
            },
          }
        },
      },
      undefined,
      {
        postCommitEventPublisher: {
          async publish() {
            return undefined
          },
        },
      },
    )

    const summary = await executionService.runMatchCycle()

    expect(summary).toEqual({
      slotsScanned: 2,
      pairsAttempted: 1,
      matchesCreated: 0,
      skippedAttempts: 1,
      transactionConflicts: 1,
      transactionRetries: 1,
      createdInterviewIds: [],
    })
  })

  it('does not emit post-commit events for skipped match attempts', async function shouldSkipEventEmission() {
    const publishedEvents: unknown[] = []
    const executionService = new MatcherExecutionService(
      {
        async listCandidateRows() {
          return [
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
        },
        async executePairAttemptTransaction() {
          return {
            status: 'skipped',
            reason: 'request_quota_reached',
            diagnostics: {
              transactionConflicts: 0,
              transactionRetries: 0,
            },
          }
        },
      },
      undefined,
      {
        postCommitEventPublisher: {
          async publish(event) {
            publishedEvents.push(event)
          },
        },
      },
    )

    const summary = await executionService.runMatchCycle()

    expect(summary.matchesCreated).toBe(0)
    expect(publishedEvents).toEqual([])
  })

  it('does not emit post-commit events when transaction write fails', async function shouldNotEmitWhenWriteFails() {
    const publishedEvents: unknown[] = []
    const executionService = new MatcherExecutionService(
      {
        async listCandidateRows() {
          return [
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
        },
        async executePairAttemptTransaction() {
          throw new Error('transaction failed')
        },
      },
      undefined,
      {
        postCommitEventPublisher: {
          async publish(event) {
            publishedEvents.push(event)
          },
        },
      },
    )

    await expect(executionService.runMatchCycle()).rejects.toThrow('transaction failed')
    expect(publishedEvents).toEqual([])
  })

  it('continues matcher execution even when logger calls fail', async function shouldIgnoreLoggerFailures() {
    const executionService = new MatcherExecutionService(
      {
        async listCandidateRows() {
          return [
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
        },
        async executePairAttemptTransaction() {
          return {
            status: 'skipped',
            reason: 'request_quota_reached',
            diagnostics: {
              transactionConflicts: 0,
              transactionRetries: 0,
            },
          }
        },
      },
      undefined,
      {
        postCommitEventPublisher: {
          async publish() {
            return undefined
          },
        },
        logger: {
          async info() {
            throw new Error('logger info failed')
          },
          async error() {
            throw new Error('logger error failed')
          },
        },
      },
    )

    const summary = await executionService.runMatchCycle()

    expect(summary).toEqual({
      slotsScanned: 2,
      pairsAttempted: 1,
      matchesCreated: 0,
      skippedAttempts: 1,
      transactionConflicts: 0,
      transactionRetries: 0,
      createdInterviewIds: [],
    })
  })

  it('fails when a match is created without a configured post-commit publisher', async function shouldRequirePublisher() {
    const executionService = new MatcherExecutionService({
      async listCandidateRows() {
        return [
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
      },
      async executePairAttemptTransaction() {
        return {
          status: 'created',
          interviewId: '99999999-9999-4999-8999-999999999999',
          interview: {
            id: '99999999-9999-4999-8999-999999999999',
            scheduler_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            interviewer_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            type: 'system_design',
            mode: 'peer_to_peer',
            tier: 'standard',
            status: 'scheduled',
            scheduled_at: '2026-04-10T10:30:00.000Z',
          },
          diagnostics: {
            transactionConflicts: 0,
            transactionRetries: 0,
          },
        }
      },
    })

    await expect(executionService.runMatchCycle()).rejects.toThrow(
      'MatcherExecutionService post-commit event publisher is not configured',
    )
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
