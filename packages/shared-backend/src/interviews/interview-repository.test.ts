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
})
