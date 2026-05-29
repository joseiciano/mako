import { describe, expect, it, vi } from 'vitest'
import {
  InterviewRepository,
  createInMemoryInterviewDataSource,
} from './interview-repository'
import { InterviewPolicyConflictError } from './types'
import type { SqlQuery } from '../index'
import type { NotificationQueueEvent } from '../notification-queue-event-contract'
import type { Interview } from '@mako/shared'

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
      created_at: '2026-04-13T09:55:00.000Z',
      updated_at: '2026-04-13T09:55:00.000Z',
    }

    const repository = new InterviewRepository(
      createInMemoryInterviewDataSource(
        [
          {
            userId: participantId,
            credits: 0,
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

  describe('SQL path', function sqlPathSuite() {
    const optionalColumns = [
      'realtime_session_id',
      'excalidraw_room_id',
      'excalidraw_key',
      'recording_url',
      'screenshot_urls',
      'feedback',
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

    it('listParticipantInterviews selects all optional columns', async function run() {
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
        expect(listQuery!.text).toContain(column)
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

      expect(result.realtime_session_id).toBe('sess_abc123')
      expect(result.excalidraw_room_id).toBe('room_def456')
      expect(result.excalidraw_key).toBe('key_ghi789')
      expect(result.recording_url).toBe('https://r2.example.com/recording.mp4')
      expect(result.screenshot_urls).toEqual(['https://r2.example.com/ss1.png'])
      expect(result.feedback).toEqual({ score: 85 })
    })

    it('createDirectInterview parses timestamptz offsets in created_at and updated_at from SQL result', async function run() {
      const mockQueryExecutor = createMockQueryExecutor({
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
  })
})
