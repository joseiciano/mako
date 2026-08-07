import { describe, expect, it, vi } from 'vitest'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
} from './interview-repository'
import { InterviewPolicyConflictError } from './types'
import type { SqlQuery } from '../index'
import type { NotificationQueueEvent } from '../notification-queue-event-contract'
import type { Interview, InterviewDetail } from '@mako/shared'

describe('InterviewRepository', function interviewRepositorySuite() {
  it('createDirectInterview persists outbox event before commit in SQL path', async function run() {
    const queries: Array<{ text: string; values: readonly unknown[] }> = []
    let persistCallIndex = -1
    let commitIndex = -1

    const mockPersistOutboxEvent = vi.fn(async (_event: NotificationQueueEvent) => {
      persistCallIndex = queries.length
      queries.push({ text: 'PERSIST_OUTBOX_EVENT', values: [] })
    })

    const mockQueryExecutor = {
      async query<Row>(query: SqlQuery) {
        queries.push(query)
        const normalized = query.text.trim().toUpperCase()

        if (normalized === 'BEGIN;') {
          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        }
        if (query.text.includes('FROM "user"') && query.text.includes('FOR UPDATE')) {
          return {
            rows: [{ credits: 1, free_standard_interviews: 1, free_ai_interviews: 1 }] as Row[],
            rowCount: 1,
          }
        }
        if (query.text.includes('UPDATE "user"')) {
          return {
            rows: [{ id: '44444444-4444-4444-8444-444444444444' }] as Row[],
            rowCount: 1,
          }
        }
        if (query.text.includes('INSERT INTO interviews')) {
          return {
            rows: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                scheduler_id: '22222222-2222-4222-8222-222222222222',
                scheduler_alias: 'Scheduler',
                interviewer_id: null,
                interviewer_alias: 'Interviewer',
                type: 'system_design',
                mode: 'ai_led',
                tier: 'standard',
                status: 'scheduled',
                scheduled_at: '2026-05-22T10:00:00.000Z',
                realtime_session_id: null,
                excalidraw_room_id: null,
                excalidraw_key: null,
                recording_url: null,
                screenshot_urls: null,
                feedback: null,
                recording_status: 'not_started',
                transcript: null,
                feedback_status: 'not_started',
                feedback_unavailable_reason: null,
                feedback_error_code: null,
                feedback_prompt_version: null,
                feedback_generated_at: null,
                started_at: null,
                expires_at: null,
                warning_at: null,
                created_at: '2026-05-22T09:00:00.000Z',
                updated_at: '2026-05-22T09:00:00.000Z',
              },
            ],
            rowCount: 1,
          } as { rows: Row[]; rowCount: number }
        }
        if (query.text.includes('INSERT INTO notification_outbox_events')) {
          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        }
        if (normalized === 'COMMIT;') {
          commitIndex = queries.length - 1
          return { rows: [], rowCount: 0 }
        }
        return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
      },
    }

    const repository = new InterviewRepository({
      queryExecutor: mockQueryExecutor,
      persistOutboxEvent: mockPersistOutboxEvent,
    })

    const outboxEvent: NotificationQueueEvent = {
      event_type: 'interview.created',
      event_id: '33333333-3333-4333-8333-333333333333',
      idempotency_key: 'key',
      occurred_at: '2026-05-22T10:00:00.000Z',
      interview: {
        id: '11111111-1111-4111-8111-111111111111',
        scheduler_id: '22222222-2222-4222-8222-222222222222',
        interviewer_id: null,
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-05-22T10:00:00.000Z',
      },
      participants: {
        scheduler_user_id: '22222222-2222-4222-8222-222222222222',
        interviewer_user_id: null,
      },
    }

    await repository.createDirectInterview(
      {
        id: '11111111-1111-4111-8111-111111111111',
        scheduler_id: '22222222-2222-4222-8222-222222222222',
        scheduler_alias: 'Scheduler',
        interviewer_id: null,
        interviewer_alias: 'Interviewer',
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-05-22T10:00:00.000Z',
        created_at: '2026-05-22T09:00:00.000Z',
        updated_at: '2026-05-22T09:00:00.000Z',
        policy_consumption: 'free_ai_interview',
      },
      outboxEvent,
    )

    expect(mockPersistOutboxEvent).toHaveBeenCalledTimes(1)
    expect(mockPersistOutboxEvent).toHaveBeenCalledWith(outboxEvent)
    expect(commitIndex).toBeGreaterThan(persistCallIndex)
  })

  it('createDirectInterview rolls back when outbox persistence fails in SQL path', async function run() {
    const queries: Array<{ text: string; values: readonly unknown[] }> = []

    const mockPersistOutboxEvent = vi.fn(async () => {
      throw new Error('outbox persist failure')
    })

    const mockQueryExecutor = {
      async query<Row>(query: SqlQuery) {
        queries.push(query)
        const normalized = query.text.trim().toUpperCase()

        if (normalized === 'BEGIN;') {
          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        }
        if (query.text.includes('FROM "user"') && query.text.includes('FOR UPDATE')) {
          return {
            rows: [{ credits: 1, free_standard_interviews: 1, free_ai_interviews: 1 }] as Row[],
            rowCount: 1,
          }
        }
        if (query.text.includes('UPDATE "user"')) {
          return {
            rows: [{ id: '44444444-4444-4444-8444-444444444444' }] as Row[],
            rowCount: 1,
          }
        }
        if (query.text.includes('INSERT INTO interviews')) {
          return {
            rows: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                scheduler_id: '22222222-2222-4222-8222-222222222222',
                scheduler_alias: 'Scheduler',
                interviewer_id: null,
                interviewer_alias: 'Interviewer',
                type: 'system_design',
                mode: 'ai_led',
                tier: 'standard',
                status: 'scheduled',
                scheduled_at: '2026-05-22T10:00:00.000Z',
                realtime_session_id: null,
                excalidraw_room_id: null,
                excalidraw_key: null,
                recording_url: null,
                screenshot_urls: null,
                feedback: null,
                recording_status: 'not_started',
                transcript: null,
                feedback_status: 'not_started',
                feedback_unavailable_reason: null,
                feedback_error_code: null,
                feedback_prompt_version: null,
                feedback_generated_at: null,
                started_at: null,
                expires_at: null,
                warning_at: null,
                created_at: '2026-05-22T09:00:00.000Z',
                updated_at: '2026-05-22T09:00:00.000Z',
              },
            ],
            rowCount: 1,
          } as { rows: Row[]; rowCount: number }
        }
        if (normalized === 'ROLLBACK;') {
          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        }
        return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
      },
    }

    const repository = new InterviewRepository({
      queryExecutor: mockQueryExecutor,
      persistOutboxEvent: mockPersistOutboxEvent,
    })

    await expect(
      repository.createDirectInterview(
        {
                id: '11111111-1111-4111-8111-111111111111',
                scheduler_id: '22222222-2222-4222-8222-222222222222',
          scheduler_alias: 'Scheduler',
          interviewer_id: null,
          interviewer_alias: 'Interviewer',
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-05-22T10:00:00.000Z',
          created_at: '2026-05-22T09:00:00.000Z',
          updated_at: '2026-05-22T09:00:00.000Z',
          policy_consumption: 'free_ai_interview',
        },
        {
          event_type: 'interview.created',
          event_id: '33333333-3333-4333-8333-333333333333',
          idempotency_key: 'key',
          occurred_at: '2026-05-22T10:00:00.000Z',
          interview: {
        id: '11111111-1111-4111-8111-111111111111',
        scheduler_id: '22222222-2222-4222-8222-222222222222',
            interviewer_id: null,
            type: 'system_design',
            mode: 'ai_led',
            tier: 'standard',
            status: 'scheduled',
            scheduled_at: '2026-05-22T10:00:00.000Z',
          },
          participants: {
            scheduler_user_id: '22222222-2222-4222-8222-222222222222',
            interviewer_user_id: null,
          },
        } as NotificationQueueEvent,
      ),
    ).rejects.toThrow('outbox persist failure')

    const rollbackIndex = queries.findIndex((q) => q.text.trim().toUpperCase() === 'ROLLBACK;')
    expect(rollbackIndex).toBeGreaterThan(-1)
  })

  it('in-memory listParticipantInterviews sorts chronologically by instant, not lexicographically, with id tiebreak (Story 3.2 regression)', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'

    const earlierUtc: Interview = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scheduler_id: participantId,
      scheduler_alias: 'Scheduler',
      interviewer_id: null,
      interviewer_alias: 'Interviewer',
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-01T14:00:00.000Z',
      realtime_session_id: null,
      excalidraw_room_id: null,
      excalidraw_key: null,
      recording_url: null,
      screenshot_urls: null,
      feedback: null,
      started_at: null,
      expires_at: null,
      warning_at: null,
      created_at: '2026-04-13T09:55:00.000Z',
      updated_at: '2026-04-13T09:55:00.000Z',
    }

    const laterWithOffset: Interview = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      scheduler_id: participantId,
      scheduler_alias: 'Scheduler',
      interviewer_id: null,
      interviewer_alias: 'Interviewer',
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-05-01T10:00:00-05:00',
      realtime_session_id: null,
      excalidraw_room_id: null,
      excalidraw_key: null,
      recording_url: null,
      screenshot_urls: null,
      feedback: null,
      started_at: null,
      expires_at: null,
      warning_at: null,
      created_at: '2026-04-13T09:55:00.000Z',
      updated_at: '2026-04-13T09:55:00.000Z',
    }

    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [
          {
            userId: participantId,
            credits: 0,
            freeStandardInterviews: 0,
            freeAiInterviews: 0,
          },
        ],
        [laterWithOffset, earlierUtc],
      ),
    )

    const result = await repository.listParticipantInterviews({
      participant_user_id: participantId,
      limit: 10,
      offset: 0,
    })

    const ids = result.map((i) => i.id)
    expect(ids).toEqual([earlierUtc.id, laterWithOffset.id])
  })

  it('in-memory provisionInterview persists missing credentials and reuses them on retry', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: participantId,
          }),
        ],
      ),
    )

    const firstResult = await repository.provisionInterview({
      interview_id: interviewId,
      participant_user_id: participantId,
      realtime_session_id: 'rt_first',
      excalidraw_room_id: 'room_first',
      excalidraw_key: 'key_first',
      updated_at: '2026-05-22T09:00:00.000Z',
    })
    const secondResult = await repository.provisionInterview({
      interview_id: interviewId,
      participant_user_id: participantId,
      realtime_session_id: 'rt_second',
      excalidraw_room_id: 'room_second',
      excalidraw_key: 'key_second',
      updated_at: '2026-05-22T09:05:00.000Z',
    })

    expect(firstResult).toMatchObject({
      outcome: 'provisioned',
      interview: {
        realtime_session_id: 'rt_first',
        excalidraw_room_id: 'room_first',
        excalidraw_key: 'key_first',
      },
    })
    expect(secondResult).toMatchObject({
      outcome: 'already_provisioned',
      interview: {
        realtime_session_id: 'rt_first',
        excalidraw_room_id: 'room_first',
        excalidraw_key: 'key_first',
      },
    })
  })

  it('in-memory provisionInterviewWithCredentialFactory invokes factory and persists returned credentials', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const factory = vi.fn(async () => ({
      realtime_session_id: 'rt_factory',
      excalidraw_room_id: 'room_factory',
      excalidraw_key: 'key_factory',
    }))

    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: participantId,
          }),
        ],
      ),
    )

    const result = await repository.provisionInterviewWithCredentialFactory(
      {
        interview_id: interviewId,
        participant_user_id: participantId,
        updated_at: '2026-05-22T09:00:00.000Z',
      },
      factory,
    )

    expect(factory).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        interview: expect.objectContaining({ id: interviewId }),
      }),
    )
    expect(result).toMatchObject({
      outcome: 'provisioned',
      interview: {
        realtime_session_id: 'rt_factory',
        excalidraw_room_id: 'room_factory',
        excalidraw_key: 'key_factory',
      },
    })
  })

  it('already_provisioned returns early without calling factory', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const factory = vi.fn(async () => ({
      realtime_session_id: 'rt_factory',
      excalidraw_room_id: 'room_factory',
      excalidraw_key: 'key_factory',
    }))

    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: participantId,
            realtime_session_id: 'rt_existing',
            excalidraw_room_id: 'room_existing',
            excalidraw_key: 'key_existing',
          }),
        ],
      ),
    )

    const result = await repository.provisionInterviewWithCredentialFactory(
      {
        interview_id: interviewId,
        participant_user_id: participantId,
        updated_at: '2026-05-22T09:00:00.000Z',
      },
      factory,
    )

    expect(factory).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      outcome: 'already_provisioned',
      interview: {
        realtime_session_id: 'rt_existing',
        excalidraw_room_id: 'room_existing',
        excalidraw_key: 'key_existing',
      },
    })
  })

  it('transitionInterviewLifecycle start transitions scheduled to ongoing', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: participantId,
          }),
        ],
      ),
    )

    const result = await repository.transitionInterviewLifecycle({
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'start',
      updated_at: '2026-05-22T09:00:00.000Z',
    })

    expect(result.outcome).toBe('started')
    expect(result).toMatchObject({
      interview: {
        status: 'ongoing',
        updated_at: '2026-05-22T09:00:00.000Z',
      },
    })
  })

  it('transitionInterviewLifecycle start is idempotent on already ongoing', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: participantId,
            status: 'ongoing',
          }),
        ],
      ),
    )

    const result = await repository.transitionInterviewLifecycle({
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'start',
      updated_at: '2026-05-22T09:00:00.000Z',
    })

    expect(result.outcome).toBe('already_ongoing')
    expect(result).toMatchObject({
      interview: { status: 'ongoing' },
    })
  })

  it('transitionInterviewLifecycle end transitions ongoing to completed', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: participantId,
            status: 'ongoing',
          }),
        ],
      ),
    )

    const result = await repository.transitionInterviewLifecycle({
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'end',
      updated_at: '2026-05-22T09:00:00.000Z',
    })

    expect(result.outcome).toBe('completed')
    expect(result).toMatchObject({
      interview: { status: 'completed' },
    })
  })

  it('transitionInterviewLifecycle end is idempotent on already completed', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: participantId,
            status: 'completed',
          }),
        ],
      ),
    )

    const result = await repository.transitionInterviewLifecycle({
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'end',
      updated_at: '2026-05-22T09:00:00.000Z',
    })

    expect(result.outcome).toBe('already_completed')
  })

  it('transitionInterviewLifecycle returns invalid_status for invalid transitions', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: participantId,
            status: 'cancelled',
          }),
        ],
      ),
    )

    const startResult = await repository.transitionInterviewLifecycle({
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'start',
      updated_at: '2026-05-22T09:00:00.000Z',
    })
    expect(startResult.outcome).toBe('invalid_status')

    const endResult = await repository.transitionInterviewLifecycle({
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'end',
      updated_at: '2026-05-22T09:00:00.000Z',
    })
    expect(endResult.outcome).toBe('invalid_status')
  })

  it('transitionInterviewLifecycle returns not_found for non-participant', async function run() {
    const participantId = '11111111-1111-4111-8111-111111111111'
    const interviewId = '33333333-3333-4333-8333-333333333333'
    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
        [
          createInterviewRecord({
            id: interviewId,
            scheduler_id: '99999999-9999-4999-8999-999999999999',
          }),
        ],
      ),
    )

    const result = await repository.transitionInterviewLifecycle({
      interview_id: interviewId,
      participant_user_id: participantId,
      action: 'start',
      updated_at: '2026-05-22T09:00:00.000Z',
    })

    expect(result.outcome).toBe('not_found')
  })

  describe('SQL path', function sqlPathSuite() {
    const optionalColumns = [
      'realtime_session_id',
      'excalidraw_room_id',
      'excalidraw_key',
      'recording_url',
      'screenshot_urls',
      'feedback',
    ]

    const feedbackProcessingColumns = [
      'recording_status',
      'transcript',
      'feedback_status',
      'feedback_unavailable_reason',
      'feedback_error_code',
      'feedback_prompt_version',
      'feedback_generated_at',
    ]

    function createMockQueryExecutor(
      overrides: Record<string, (query: SqlQuery) => { rows: unknown[]; rowCount: number }> = {},
    ) {
      const queries: SqlQuery[] = []

      const mockQueryExecutor = {
        async query<Row>(query: SqlQuery) {
          queries.push(query)
          const normalized = query.text.trim().toUpperCase()

          if (normalized === 'BEGIN;') {
            return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
          }

          if (normalized === 'COMMIT;') {
            return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
          }

          if (normalized === 'ROLLBACK;') {
            return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
          }

          for (const [key, handler] of Object.entries(overrides)) {
            if (query.text.includes(key)) {
              return handler(query) as { rows: Row[]; rowCount: number }
            }
          }

          return { rows: [], rowCount: 0 } as { rows: Row[]; rowCount: number }
        },
        get queries() {
          return queries
        },
      }

      return mockQueryExecutor
    }

    it('listParticipantInterviews selects only summary columns', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({
          rows: [],
          rowCount: 0,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      await repository.listParticipantInterviews({
        participant_user_id: '11111111-1111-4111-8111-111111111111',
        limit: 10,
        offset: 0,
      })

      const listQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('FROM interviews'),
      )
      expect(listQuery).toBeDefined()

      for (const column of optionalColumns) {
        expect(listQuery!.text).not.toContain(column)
      }
    })

    it('listParticipantInterviews applies status filter and uses deterministic ordering', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({
          rows: [],
          rowCount: 0,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      await repository.listParticipantInterviews({
        participant_user_id: '11111111-1111-4111-8111-111111111111',
        status: 'scheduled',
        limit: 10,
        offset: 0,
      })

      const listQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('FROM interviews'),
      )
      expect(listQuery).toBeDefined()
      expect(listQuery!.text).toContain('AND status =')
      expect(listQuery!.text).toContain('ORDER BY scheduled_at ASC, id ASC')
    })

    it('listParticipantInterviews scopes to participant via scheduler_id or interviewer_id', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({
          rows: [],
          rowCount: 0,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      await repository.listParticipantInterviews({
        participant_user_id: '11111111-1111-4111-8111-111111111111',
        limit: 10,
        offset: 0,
      })

      const listQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('FROM interviews'),
      )
      expect(listQuery).toBeDefined()
      expect(listQuery!.text).toContain('scheduler_id = $1')
      expect(listQuery!.text).toContain('interviewer_id = $1')
    })

    it('getInterviewById selects all optional columns', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      await repository.getInterviewById('11111111-1111-4111-8111-111111111111')

      const getQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('FROM interviews'),
      )
      expect(getQuery).toBeDefined()

      for (const column of optionalColumns) {
        expect(getQuery!.text).toContain(column)
      }
    })

    it('getParticipantInterviewById omits credential columns and scopes to participant', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              recording_url: 'https://r2.example.com/recording.mp4',
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.getParticipantInterviewById({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
      })

      expect(result).not.toBeNull()
      expect(result).not.toHaveProperty('realtime_session_id')
      expect(result).not.toHaveProperty('excalidraw_room_id')
      expect(result).not.toHaveProperty('excalidraw_key')
      expect(result?.recording_url).toBe('https://r2.example.com/recording.mp4')

      const getQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('FROM interviews'),
      )
      expect(getQuery).toBeDefined()
      expect(getQuery!.text).toContain('scheduler_id = $2')
      expect(getQuery!.text).toContain('interviewer_id = $2')

      const credentialColumns = [
        'realtime_session_id',
        'excalidraw_room_id',
        'excalidraw_key',
      ]
      for (const column of credentialColumns) {
        expect(getQuery!.text).not.toContain(column)
      }

      const detailColumns = ['recording_url', 'screenshot_urls', 'feedback']
      for (const column of detailColumns) {
        expect(getQuery!.text).toContain(column)
      }

      for (const column of feedbackProcessingColumns) {
        expect(getQuery!.text).toContain(column)
      }
    })

    it('getParticipantInterviewById returns null for non-participants', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({
          rows: [],
          rowCount: 0,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.getParticipantInterviewById({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '99999999-9999-4999-8999-999999999999',
      })

      expect(result).toBeNull()
    })

    it('cancelInterview lookup selects all optional columns and scopes to participant', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
        'UPDATE interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'cancelled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      await repository.cancelInterview({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      const lookupQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('FOR UPDATE'),
      )
      expect(lookupQuery).toBeDefined()

      for (const column of optionalColumns) {
        expect(lookupQuery!.text).toContain(column)
      }

      expect(lookupQuery!.text).toContain('scheduler_id = $2')
      expect(lookupQuery!.text).toContain('interviewer_id = $2')
    })

    it('cancelInterview update returns all optional columns', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
        'UPDATE interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'cancelled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.cancelInterview({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      const updateQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('UPDATE interviews'),
      )
      expect(updateQuery).toBeDefined()

      for (const column of optionalColumns) {
        expect(updateQuery!.text).toContain(column)
      }

      for (const column of feedbackProcessingColumns) {
        expect(updateQuery!.text).toContain(column)
      }
    })

    it('cancelInterview returns already_cancelled when interview is already cancelled', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'cancelled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.cancelInterview({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('already_cancelled')
    })

    it('cancelInterview returns invalid_status when interview is not scheduled', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'completed',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.cancelInterview({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('invalid_status')
    })

    it('createDirectInterview RETURNING clause includes all optional columns and preserves populated values', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM "user"': () => ({
          rows: [{ credits: 1, free_standard_interviews: 1, free_ai_interviews: 1 }],
          rowCount: 1,
        }),
        'UPDATE "user"': () => ({
          rows: [{ id: '44444444-4444-4444-8444-444444444444' }],
          rowCount: 1,
        }),
        'INSERT INTO interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: 'sess_abc123',
              excalidraw_room_id: 'room_def456',
              excalidraw_key: 'key_ghi789',
              recording_url: 'https://r2.example.com/recording.mp4',
              screenshot_urls: ['https://r2.example.com/ss1.png'],
              feedback: { score: 85 },
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.createDirectInterview({
        id: '11111111-1111-4111-8111-111111111111',
        scheduler_id: '22222222-2222-4222-8222-222222222222',
        scheduler_alias: 'Scheduler',
        interviewer_id: null,
        interviewer_alias: 'Interviewer',
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-05-22T10:00:00.000Z',
        created_at: '2026-05-22T09:00:00.000Z',
        updated_at: '2026-05-22T09:00:00.000Z',
        policy_consumption: 'free_ai_interview',
      })

      const insertQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('INSERT INTO interviews'),
      )
      expect(insertQuery).toBeDefined()

      for (const column of optionalColumns) {
        expect(insertQuery!.text).toContain(column)
      }

      for (const column of feedbackProcessingColumns) {
        expect(insertQuery!.text).toContain(column)
      }

      expect(result.realtime_session_id).toBe('sess_abc123')
      expect(result.excalidraw_room_id).toBe('room_def456')
      expect(result.excalidraw_key).toBe('key_ghi789')
      expect(result.recording_url).toBe('https://r2.example.com/recording.mp4')
      expect(result.screenshot_urls).toEqual(['https://r2.example.com/ss1.png'])
      expect(result.feedback).toEqual({ score: 85 })
    })

    it('createDirectInterview parses timestamptz offsets in created_at and updated_at from SQL result', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM "user"': () => ({
          rows: [{ credits: 1, free_standard_interviews: 1, free_ai_interviews: 1 }],
          rowCount: 1,
        }),
        'UPDATE "user"': () => ({
          rows: [{ id: '44444444-4444-4444-8444-444444444444' }],
          rowCount: 1,
        }),
        'INSERT INTO interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000+00:00',
              updated_at: '2026-05-22T09:00:00.000-05:00',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.createDirectInterview({
        id: '11111111-1111-4111-8111-111111111111',
        scheduler_id: '22222222-2222-4222-8222-222222222222',
        scheduler_alias: 'Scheduler',
        interviewer_id: null,
        interviewer_alias: 'Interviewer',
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-05-22T10:00:00.000Z',
        created_at: '2026-05-22T09:00:00.000+00:00',
        updated_at: '2026-05-22T09:00:00.000-05:00',
        policy_consumption: 'free_ai_interview',
      })

      expect(result.created_at).toBe('2026-05-22T09:00:00.000+00:00')
      expect(result.updated_at).toBe('2026-05-22T09:00:00.000-05:00')
    })

    it('createDirectInterview decrements credits when policy_consumption is credit', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM "user"': () => ({
          rows: [{ credits: 1, free_standard_interviews: 1, free_ai_interviews: 0 }],
          rowCount: 1,
        }),
        'credits = credits -': () => ({
          rows: [{ id: '44444444-4444-4444-8444-444444444444', credits: 0 }],
          rowCount: 1,
        }),
        'INSERT INTO interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'premium',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.createDirectInterview({
        id: '11111111-1111-4111-8111-111111111111',
        scheduler_id: '22222222-2222-4222-8222-222222222222',
        scheduler_alias: 'Scheduler',
        interviewer_id: null,
        interviewer_alias: 'Interviewer',
        type: 'system_design',
        mode: 'ai_led',
        tier: 'premium',
        status: 'scheduled',
        scheduled_at: '2026-05-22T10:00:00.000Z',
        created_at: '2026-05-22T09:00:00.000Z',
        updated_at: '2026-05-22T09:00:00.000Z',
        policy_consumption: 'credit',
      })

      const creditQuery = mockQueryExecutor.queries.find((q) =>
        q.text.includes('credits = credits -'),
      )
      expect(creditQuery).toBeDefined()
      expect(result.tier).toBe('premium')
    })

    it('createDirectInterview throws InterviewPolicyConflictError when free_ai_interview decrement fails', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM "user"': () => ({
          rows: [{ credits: 1, free_standard_interviews: 1, free_ai_interviews: 0 }],
          rowCount: 1,
        }),
        'free_ai_interviews': () => ({
          rows: [],
          rowCount: 0,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      await expect(
        repository.createDirectInterview({
          id: '11111111-1111-4111-8111-111111111111',
          scheduler_id: '22222222-2222-4222-8222-222222222222',
          scheduler_alias: 'Scheduler',
          interviewer_id: null,
          interviewer_alias: 'Interviewer',
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'scheduled',
          scheduled_at: '2026-05-22T10:00:00.000Z',
          created_at: '2026-05-22T09:00:00.000Z',
          updated_at: '2026-05-22T09:00:00.000Z',
          policy_consumption: 'free_ai_interview',
        }),
      ).rejects.toBeInstanceOf(InterviewPolicyConflictError)

      const rollbackQuery = mockQueryExecutor.queries.find((q) =>
        q.text.trim().toUpperCase() === 'ROLLBACK;',
      )
      expect(rollbackQuery).toBeDefined()
    })

    it('createDirectInterview throws InterviewPolicyConflictError when credit decrement fails', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FROM "user"': () => ({
          rows: [{ credits: 0, free_standard_interviews: 1, free_ai_interviews: 0 }],
          rowCount: 1,
        }),
        'credits = credits -': () => ({
          rows: [],
          rowCount: 0,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      await expect(
        repository.createDirectInterview({
          id: '11111111-1111-4111-8111-111111111111',
          scheduler_id: '22222222-2222-4222-8222-222222222222',
          scheduler_alias: 'Scheduler',
          interviewer_id: null,
          interviewer_alias: 'Interviewer',
          type: 'system_design',
          mode: 'ai_led',
          tier: 'premium',
          status: 'scheduled',
          scheduled_at: '2026-05-22T10:00:00.000Z',
          created_at: '2026-05-22T09:00:00.000Z',
          updated_at: '2026-05-22T09:00:00.000Z',
          policy_consumption: 'credit',
        }),
      ).rejects.toBeInstanceOf(InterviewPolicyConflictError)

      const rollbackQuery = mockQueryExecutor.queries.find((q) =>
        q.text.trim().toUpperCase() === 'ROLLBACK;',
      )
      expect(rollbackQuery).toBeDefined()
    })

    it('cancelInterview returns not_found when interview does not exist or participant is unauthorized', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [],
          rowCount: 0,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.cancelInterview({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('not_found')

    })

    it('cancelInterview persists outbox event before commit in SQL path', async function run() {
      const queries: Array<{ text: string; values: readonly unknown[] }> = []
      let persistCallIndex = -1
      let commitIndex = -1

      const mockPersistOutboxEvent = vi.fn(async (_event: NotificationQueueEvent) => {
        persistCallIndex = queries.length
        queries.push({ text: 'PERSIST_OUTBOX_EVENT', values: [] })
      })

      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
        'UPDATE interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'cancelled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const originalQuery = mockQueryExecutor.query
      mockQueryExecutor.query = async function query<Row>(q: SqlQuery) {
        queries.push(q)
        const normalized = q.text.trim().toUpperCase()
        if (normalized === 'COMMIT;') {
          commitIndex = queries.length - 1
        }
        return (await originalQuery.call(mockQueryExecutor, q)) as {
          rows: Row[]
          rowCount: number
        }
      }

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
        persistOutboxEvent: mockPersistOutboxEvent,
      })

      const outboxEvent: NotificationQueueEvent = {
        event_type: 'interview.cancelled',
        event_id: '33333333-3333-4333-8333-333333333333',
        idempotency_key: 'key',
        occurred_at: '2026-05-22T10:00:00.000Z',
        interview: {
          id: '11111111-1111-4111-8111-111111111111',
          scheduler_id: '22222222-2222-4222-8222-222222222222',
          interviewer_id: null,
          type: 'system_design',
          mode: 'ai_led',
          tier: 'standard',
          status: 'cancelled',
          scheduled_at: '2026-05-22T10:00:00.000Z',
        },
        participants: {
          scheduler_user_id: '22222222-2222-4222-8222-222222222222',
          interviewer_user_id: null,
        },
      }

      await repository.cancelInterview(
        {
          interview_id: '11111111-1111-4111-8111-111111111111',
          participant_user_id: '22222222-2222-4222-8222-222222222222',
          updated_at: '2026-05-22T09:00:00.000Z',
        },
        outboxEvent,
      )

      expect(mockPersistOutboxEvent).toHaveBeenCalledTimes(1)
      expect(mockPersistOutboxEvent).toHaveBeenCalledWith(outboxEvent)
      expect(commitIndex).toBeGreaterThan(persistCallIndex)
    })

    it('cancelInterview rolls back when outbox persistence fails in SQL path', async function run() {
      const queries: SqlQuery[] = []

      const mockPersistOutboxEvent = vi.fn(async () => {
        throw new Error('outbox persist failure')
      })

      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'scheduled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
        'UPDATE interviews': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'cancelled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const originalQuery = mockQueryExecutor.query
      mockQueryExecutor.query = async function query<Row>(q: SqlQuery) {
        queries.push(q)
        return (await originalQuery.call(mockQueryExecutor, q)) as {
          rows: Row[]
          rowCount: number
        }
      }

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
        persistOutboxEvent: mockPersistOutboxEvent,
      })

      await expect(
        repository.cancelInterview(
          {
            interview_id: '11111111-1111-4111-8111-111111111111',
            participant_user_id: '22222222-2222-4222-8222-222222222222',
            updated_at: '2026-05-22T09:00:00.000Z',
          },
          {
            event_type: 'interview.cancelled',
            event_id: '33333333-3333-4333-8333-333333333333',
            idempotency_key: 'key',
            occurred_at: '2026-05-22T10:00:00.000Z',
            interview: {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              interviewer_id: null,
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'cancelled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
            },
            participants: {
              scheduler_user_id: '22222222-2222-4222-8222-222222222222',
              interviewer_user_id: null,
            },
          } as NotificationQueueEvent,
        ),
      ).rejects.toThrow('outbox persist failure')

      const rollbackIndex = queries.findIndex((q) => q.text.trim().toUpperCase() === 'ROLLBACK;')
      expect(rollbackIndex).toBeGreaterThan(-1)
    })

    it('cancelInterview does not persist outbox for already_cancelled outcome', async function run() {
      const mockPersistOutboxEvent = vi.fn(async () => {})

      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'cancelled',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
        persistOutboxEvent: mockPersistOutboxEvent,
      })

      const result = await repository.cancelInterview(
        {
          interview_id: '11111111-1111-4111-8111-111111111111',
          participant_user_id: '22222222-2222-4222-8222-222222222222',
          updated_at: '2026-05-22T09:00:00.000Z',
        },
        {
          event_type: 'interview.cancelled',
          event_id: '33333333-3333-4333-8333-333333333333',
          idempotency_key: 'key',
          occurred_at: '2026-05-22T10:00:00.000Z',
          interview: {
            id: '11111111-1111-4111-8111-111111111111',
            scheduler_id: '22222222-2222-4222-8222-222222222222',
            interviewer_id: null,
            type: 'system_design',
            mode: 'ai_led',
            tier: 'standard',
            status: 'cancelled',
            scheduled_at: '2026-05-22T10:00:00.000Z',
          },
          participants: {
            scheduler_user_id: '22222222-2222-4222-8222-222222222222',
            interviewer_user_id: null,
          },
        } as NotificationQueueEvent,
      )

      expect(result.outcome).toBe('already_cancelled')
      expect(mockPersistOutboxEvent).not.toHaveBeenCalled()
    })

    it('cancelInterview does not persist outbox for invalid_status outcome', async function run() {
      const mockPersistOutboxEvent = vi.fn(async () => {})

      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              scheduler_alias: 'Scheduler',
              interviewer_id: null,
              interviewer_alias: 'Interviewer',
              type: 'system_design',
              mode: 'ai_led',
              tier: 'standard',
              status: 'completed',
              scheduled_at: '2026-05-22T10:00:00.000Z',
              realtime_session_id: null,
              excalidraw_room_id: null,
              excalidraw_key: null,
              recording_url: null,
              screenshot_urls: null,
              feedback: null,
              recording_status: 'not_started',
              transcript: null,
              feedback_status: 'not_started',
              feedback_unavailable_reason: null,
              feedback_error_code: null,
              feedback_prompt_version: null,
              feedback_generated_at: null,
              started_at: null,
              expires_at: null,
              warning_at: null,
              created_at: '2026-05-22T09:00:00.000Z',
              updated_at: '2026-05-22T09:00:00.000Z',
            },
          ],
          rowCount: 1,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
        persistOutboxEvent: mockPersistOutboxEvent,
      })

      const result = await repository.cancelInterview(
        {
          interview_id: '11111111-1111-4111-8111-111111111111',
          participant_user_id: '22222222-2222-4222-8222-222222222222',
          updated_at: '2026-05-22T09:00:00.000Z',
        },
        {
          event_type: 'interview.cancelled',
          event_id: '33333333-3333-4333-8333-333333333333',
          idempotency_key: 'key',
          occurred_at: '2026-05-22T10:00:00.000Z',
          interview: {
            id: '11111111-1111-4111-8111-111111111111',
            scheduler_id: '22222222-2222-4222-8222-222222222222',
            interviewer_id: null,
            type: 'system_design',
            mode: 'ai_led',
            tier: 'standard',
            status: 'cancelled',
            scheduled_at: '2026-05-22T10:00:00.000Z',
          },
          participants: {
            scheduler_user_id: '22222222-2222-4222-8222-222222222222',
            interviewer_user_id: null,
          },
        } as NotificationQueueEvent,
      )

      expect(result.outcome).toBe('invalid_status')
      expect(mockPersistOutboxEvent).not.toHaveBeenCalled()
    })

    it('cancelInterview does not persist outbox for not_found outcome', async function run() {
      const mockPersistOutboxEvent = vi.fn(async () => {})

      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [],
          rowCount: 0,
        }),
      })

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
        persistOutboxEvent: mockPersistOutboxEvent,
      })

      const result = await repository.cancelInterview(
        {
          interview_id: '11111111-1111-4111-8111-111111111111',
          participant_user_id: '22222222-2222-4222-8222-222222222222',
          updated_at: '2026-05-22T09:00:00.000Z',
        },
        {
          event_type: 'interview.cancelled',
          event_id: '33333333-3333-4333-8333-333333333333',
          idempotency_key: 'key',
          occurred_at: '2026-05-22T10:00:00.000Z',
          interview: {
            id: '11111111-1111-4111-8111-111111111111',
            scheduler_id: '22222222-2222-4222-8222-222222222222',
            interviewer_id: null,
            type: 'system_design',
            mode: 'ai_led',
            tier: 'standard',
            status: 'cancelled',
            scheduled_at: '2026-05-22T10:00:00.000Z',
          },
          participants: {
            scheduler_user_id: '22222222-2222-4222-8222-222222222222',
            interviewer_user_id: null,
          },
        } as NotificationQueueEvent,
      )

      expect(result.outcome).toBe('not_found')
      expect(mockPersistOutboxEvent).not.toHaveBeenCalled()
    })

    it('provisionInterview uses row locking, participant scoping, COALESCE persistence, and commits', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
            }),
          ],
          rowCount: 1,
        }),
        'UPDATE interviews': (query) => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              realtime_session_id: String(query.values[2]),
              excalidraw_room_id: String(query.values[3]),
              excalidraw_key: String(query.values[4]),
              updated_at: String(query.values[5]),
            }),
          ],
          rowCount: 1,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.provisionInterview({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        realtime_session_id: 'rt_first',
        excalidraw_room_id: 'room_first',
        excalidraw_key: 'key_first',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      const rowLockQuery = mockQueryExecutor.queries.find((query) =>
        query.text.includes('FOR UPDATE'),
      )
      const updateQuery = mockQueryExecutor.queries.find((query) =>
        query.text.includes('UPDATE interviews'),
      )
      expect(result.outcome).toBe('provisioned')
      expect(rowLockQuery?.text).toContain('scheduler_id = $2 OR interviewer_id = $2')
      expect(updateQuery?.text).toContain('COALESCE(realtime_session_id')
      expect(updateQuery?.text).toContain('COALESCE(excalidraw_room_id')
      expect(updateQuery?.text).toContain('COALESCE(excalidraw_key')
      expect(mockQueryExecutor.queries.map((query) => query.text.trim().toUpperCase())).toEqual(
        expect.arrayContaining(['BEGIN;', 'COMMIT;']),
      )
    })

    it('provisionInterview rolls back when SQL update fails', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        'FOR UPDATE': () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
            }),
          ],
          rowCount: 1,
        }),
        'UPDATE interviews': () => {
          throw new Error('update failed')
        },
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      await expect(
        repository.provisionInterview({
          interview_id: '11111111-1111-4111-8111-111111111111',
          participant_user_id: '22222222-2222-4222-8222-222222222222',
          realtime_session_id: 'rt_first',
          excalidraw_room_id: 'room_first',
          excalidraw_key: 'key_first',
          updated_at: '2026-05-22T09:00:00.000Z',
        }),
      ).rejects.toThrow('update failed')

      expect(mockQueryExecutor.queries.map((query) => query.text.trim().toUpperCase())).toContain(
        'ROLLBACK;',
      )
    })

    it('provisionInterviewWithCredentialFactory calls factory before BEGIN in SQL path', async function run() {
      const queries: SqlQuery[] = []
      let factoryCallIndex = -1

      const factory = vi.fn(async () => {
        factoryCallIndex = queries.length
        queries.push({ text: 'FACTORY_CALL', values: [] })
        return {
          realtime_session_id: 'rt_factory',
          excalidraw_room_id: 'room_factory',
          excalidraw_key: 'key_factory',
        }
      })

      const mockQueryExecutor = createMockQueryExecutor({
        'FROM interviews': () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
            }),
          ],
          rowCount: 1,
        }),
        'UPDATE interviews': (query) => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              realtime_session_id: String(query.values[2]),
              excalidraw_room_id: String(query.values[3]),
              excalidraw_key: String(query.values[4]),
              updated_at: String(query.values[5]),
            }),
          ],
          rowCount: 1,
        }),
      })

      const originalQuery = mockQueryExecutor.query
      mockQueryExecutor.query = async function query<Row>(q: SqlQuery) {
        queries.push(q)
        return (await originalQuery.call(mockQueryExecutor, q)) as {
          rows: Row[]
          rowCount: number
        }
      }

      const repository = new InterviewRepository({
        queryExecutor: mockQueryExecutor,
      })

      const result = await repository.provisionInterviewWithCredentialFactory(
        {
          interview_id: '11111111-1111-4111-8111-111111111111',
          participant_user_id: '22222222-2222-4222-8222-222222222222',
          updated_at: '2026-05-22T09:00:00.000Z',
        },
        factory,
      )

      expect(result.outcome).toBe('provisioned')
      expect(factory).toHaveBeenCalledTimes(1)

      const beginIndex = queries.findIndex(
        (q) => q.text.trim().toUpperCase() === 'BEGIN;',
      )
      expect(beginIndex).toBeGreaterThan(factoryCallIndex)
    })

    it('transitionInterviewLifecycle start uses atomic guarded UPDATE with status guard and participant scope, no SELECT FOR UPDATE', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "SET status = 'ongoing'": () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              status: 'ongoing',
            }),
          ],
          rowCount: 1,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'start',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      const rowLockQuery = mockQueryExecutor.queries.find((query) =>
        query.text.includes('FOR UPDATE'),
      )
      const updateQuery = mockQueryExecutor.queries.find((query) =>
        query.text.includes("SET status = 'ongoing'"),
      )
      expect(rowLockQuery).toBeUndefined()
      expect(updateQuery).toBeDefined()
      expect(updateQuery!.text).toContain("status = 'ongoing'")
      expect(updateQuery!.text).toContain("AND status = 'scheduled'")
      expect(updateQuery!.text).toContain('scheduler_id = $6 OR interviewer_id = $6')
      for (const column of feedbackProcessingColumns) {
        expect(updateQuery!.text).toContain(column)
      }
      expect(result.outcome).toBe('started')
      expect(mockQueryExecutor.queries.map((query) => query.text.trim().toUpperCase())).toEqual(
        expect.arrayContaining(['BEGIN;', 'COMMIT;']),
      )
    })

    it('transitionInterviewLifecycle end uses atomic guarded UPDATE with status guard, participant scope, and started_at precondition', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "SET status = 'completed'": () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              status: 'completed',
            }),
          ],
          rowCount: 1,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'end',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      const rowLockQuery = mockQueryExecutor.queries.find((query) =>
        query.text.includes('FOR UPDATE'),
      )
      const updateQuery = mockQueryExecutor.queries.find((query) =>
        query.text.includes("SET status = 'completed'"),
      )
      expect(rowLockQuery).toBeUndefined()
      expect(updateQuery).toBeDefined()
      expect(updateQuery!.text).toContain("status = 'completed'")
      expect(updateQuery!.text).toContain("AND status = 'ongoing'")
      expect(updateQuery!.text).toContain('scheduler_id = $3 OR interviewer_id = $3')
      expect(updateQuery!.text).toContain('started_at')
      for (const column of feedbackProcessingColumns) {
        expect(updateQuery!.text).toContain(column)
      }
      expect(result.outcome).toBe('completed')
      expect(mockQueryExecutor.queries.map((query) => query.text.trim().toUpperCase())).toEqual(
        expect.arrayContaining(['BEGIN;', 'COMMIT;']),
      )
    })

    it('transitionInterviewLifecycle start returns already_ongoing via fallback classification', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "AND status = 'scheduled'": () => ({
          rows: [],
          rowCount: 0,
        }),
        'FROM interviews': () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              status: 'ongoing',
            }),
          ],
          rowCount: 1,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'start',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('already_ongoing')
    })

    it('transitionInterviewLifecycle end returns already_completed via fallback classification', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "AND status = 'ongoing'": () => ({
          rows: [],
          rowCount: 0,
        }),
        'FROM interviews': () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              status: 'completed',
            }),
          ],
          rowCount: 1,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'end',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('already_completed')
    })

    it('transitionInterviewLifecycle start returns invalid_status for cancelled', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "AND status = 'scheduled'": () => ({
          rows: [],
          rowCount: 0,
        }),
        'FROM interviews': () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
              status: 'cancelled',
            }),
          ],
          rowCount: 1,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'start',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('invalid_status')
    })

    it('transitionInterviewLifecycle end returns invalid_status for scheduled', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "AND status = 'ongoing'": () => ({
          rows: [],
          rowCount: 0,
        }),
        'FROM interviews': () => ({
          rows: [
            createInterviewRecord({
              id: '11111111-1111-4111-8111-111111111111',
              scheduler_id: '22222222-2222-4222-8222-222222222222',
            }),
          ],
          rowCount: 1,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'end',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('invalid_status')
    })

    it('transitionInterviewLifecycle returns not_found when interview does not exist', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "AND status = 'scheduled'": () => ({
          rows: [],
          rowCount: 0,
        }),
        'FROM interviews': () => ({
          rows: [],
          rowCount: 0,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'start',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('not_found')
    })

    it('transitionInterviewLifecycle rolls back when SQL update fails', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "SET status = 'ongoing'": () => {
          throw new Error('update failed')
        },
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      await expect(
        repository.transitionInterviewLifecycle({
          interview_id: '11111111-1111-4111-8111-111111111111',
          participant_user_id: '22222222-2222-4222-8222-222222222222',
          action: 'start',
          updated_at: '2026-05-22T09:00:00.000Z',
        }),
      ).rejects.toThrow('update failed')

      expect(mockQueryExecutor.queries.map((query) => query.text.trim().toUpperCase())).toContain(
        'ROLLBACK;',
      )
    })

    it('transitionInterviewLifecycle retries on serialization failure (40001) up to max attempts', async function run() {
      let attempt = 0

      const mockQueryExecutor = createMockQueryExecutor({
        "SET status = 'ongoing'": () => {
          attempt += 1
          if (attempt < 3) {
            throw Object.assign(new Error('serialization failure'), { code: '40001' })
          }
          return {
            rows: [
              createInterviewRecord({
                id: '11111111-1111-4111-8111-111111111111',
                scheduler_id: '22222222-2222-4222-8222-222222222222',
                status: 'ongoing',
              }),
            ],
            rowCount: 1,
          }
        },
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'start',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('started')
      expect(attempt).toBe(3)

      const rollbackCount = mockQueryExecutor.queries.filter(
        (query) => query.text.trim().toUpperCase() === 'ROLLBACK;',
      ).length
      expect(rollbackCount).toBeGreaterThanOrEqual(2)
    })

    it('transitionInterviewLifecycle retries on deadlock (40P01) up to max attempts', async function run() {
      let attempt = 0

      const mockQueryExecutor = createMockQueryExecutor({
        "SET status = 'ongoing'": () => {
          attempt += 1
          if (attempt < 2) {
            throw Object.assign(new Error('deadlock detected'), { code: '40P01' })
          }
          return {
            rows: [
              createInterviewRecord({
                id: '11111111-1111-4111-8111-111111111111',
                scheduler_id: '22222222-2222-4222-8222-222222222222',
                status: 'ongoing',
              }),
            ],
            rowCount: 1,
          }
        },
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'start',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('started')
      expect(attempt).toBe(2)
    })

    it('transitionInterviewLifecycle throws after exhausting retry attempts', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "SET status = 'ongoing'": () => {
          throw Object.assign(new Error('serialization failure'), { code: '40001' })
        },
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      await expect(
        repository.transitionInterviewLifecycle({
          interview_id: '11111111-1111-4111-8111-111111111111',
          participant_user_id: '22222222-2222-4222-8222-222222222222',
          action: 'start',
          updated_at: '2026-05-22T09:00:00.000Z',
        }),
      ).rejects.toThrow('serialization failure')

      const rollbackCount = mockQueryExecutor.queries.filter(
        (query) => query.text.trim().toUpperCase() === 'ROLLBACK;',
      ).length
      expect(rollbackCount).toBe(3)
    })

    it('transitionInterviewLifecycle start fallback classifies not_found when participant mismatch', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
        "AND status = 'scheduled'": () => ({
          rows: [],
          rowCount: 0,
        }),
        'FROM interviews': () => ({
          rows: [],
          rowCount: 0,
        }),
      })
      const repository = new InterviewRepository({ queryExecutor: mockQueryExecutor })

      const result = await repository.transitionInterviewLifecycle({
        interview_id: '11111111-1111-4111-8111-111111111111',
        participant_user_id: '22222222-2222-4222-8222-222222222222',
        action: 'start',
        updated_at: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('not_found')
    })
  })

  describe('in-memory started_at_precondition', function preconditionSuite() {
    it('transitionInterviewLifecycle end returns invalid_status when started_at precondition mismatches', async function run() {
      const participantId = '11111111-1111-4111-8111-111111111111'
      const interviewId = '33333333-3333-4333-8333-333333333333'
      const repository = new InterviewRepository(
        createInMemoryInterviewDataSource(
          [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
          [
            createInterviewRecord({
              id: interviewId,
              scheduler_id: participantId,
              status: 'ongoing',
              started_at: '2026-05-22T09:00:00.000Z',
            }),
          ],
        ),
      )

      const result = await repository.transitionInterviewLifecycle({
        interview_id: interviewId,
        participant_user_id: participantId,
        action: 'end',
        updated_at: '2026-05-22T10:00:00.000Z',
        started_at_precondition: '2026-05-22T08:00:00.000Z',
      })

      expect(result.outcome).toBe('invalid_status')
    })

    it('transitionInterviewLifecycle end succeeds when started_at precondition matches', async function run() {
      const participantId = '11111111-1111-4111-8111-111111111111'
      const interviewId = '33333333-3333-4333-8333-333333333333'
      const repository = new InterviewRepository(
        createInMemoryInterviewDataSource(
          [{ userId: participantId, credits: 0, freeStandardInterviews: 0, freeAiInterviews: 0 }],
          [
            createInterviewRecord({
              id: interviewId,
              scheduler_id: participantId,
              status: 'ongoing',
              started_at: '2026-05-22T09:00:00.000Z',
            }),
          ],
        ),
      )

      const result = await repository.transitionInterviewLifecycle({
        interview_id: interviewId,
        participant_user_id: participantId,
        action: 'end',
        updated_at: '2026-05-22T10:00:00.000Z',
        started_at_precondition: '2026-05-22T09:00:00.000Z',
      })

      expect(result.outcome).toBe('completed')
    })
  })
})

function createInterviewRecord(
  overrides: Partial<Interview & InterviewDetail> = {},
): Interview & InterviewDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Scheduler',
    interviewer_id: null,
    interviewer_alias: 'Interviewer',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-05-22T10:00:00.000Z',
    realtime_session_id: null,
    excalidraw_room_id: null,
    excalidraw_key: null,
    recording_url: null,
    screenshot_urls: null,
    feedback: null,
    recording_status: 'not_started',
    transcript: null,
    feedback_status: 'not_started',
    feedback_unavailable_reason: null,
    feedback_error_code: null,
    feedback_prompt_version: null,
    feedback_generated_at: null,
    started_at: null,
    expires_at: null,
    warning_at: null,
    created_at: '2026-05-22T09:00:00.000Z',
    updated_at: '2026-05-22T09:00:00.000Z',
    ...overrides,
  }
}
