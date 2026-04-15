import { describe, expect, it } from 'vitest'
import type { Interview } from '@mako/shared'
import type { SqlQuery } from '../index'
import {
  InterviewRepository,
  type SqlQueryExecutor,
} from './interview-repository'
import { InterviewPolicyConflictError } from './types'

describe('InterviewRepository', function interviewRepositorySuite() {
  it('reserves free ai quota and inserts direct ai-led interviews transactionally', async function run() {
    const executedQueries: string[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(normalizeSql(queryInput.text))

          if (queryInput.text.includes('UPDATE users')) {
            return { rows: [{ id: '11111111-1111-4111-8111-111111111111' }] }
          }

          if (queryInput.text.includes('INSERT INTO interviews')) {
            return {
              rows: [
                createInterviewRow({
                  id: '22222222-2222-4222-8222-222222222222',
                }),
              ],
            }
          }

          return { rows: [] }
        },
      }),
    })

    const interview = await repository.createDirectInterview({
      id: '22222222-2222-4222-8222-222222222222',
      scheduler_id: '11111111-1111-4111-8111-111111111111',
      scheduler_alias: 'Candidate-Blue',
      interviewer_id: null,
      interviewer_alias: 'Interviewer-Red',
      type: 'system_design',
      mode: 'ai_led',
      tier: 'standard',
      status: 'scheduled',
      scheduled_at: '2026-04-13T10:00:00.000Z',
      created_at: '2026-04-13T09:55:00.000Z',
      updated_at: '2026-04-13T09:55:00.000Z',
      policy_consumption: 'free_ai_interview',
    })

    expect(interview.tier).toBe('standard')
    expect(executedQueries).toEqual([
      'BEGIN;',
      "UPDATE users SET free_ai_interviews = free_ai_interviews - 1, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL AND free_ai_interviews > 0 RETURNING id;",
      'INSERT INTO interviews ( id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at;',
      'COMMIT;',
    ])
  })

  it('reserves credits for paid ai-led create paths', async function run() {
    const reservationQueries: string[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          if (queryInput.text.includes('UPDATE users')) {
            reservationQueries.push(normalizeSql(queryInput.text))
            return { rows: [{ id: '11111111-1111-4111-8111-111111111111' }] }
          }

          if (queryInput.text.includes('INSERT INTO interviews')) {
            return {
              rows: [
                createInterviewRow({
                  id: '22222222-2222-4222-8222-222222222222',
                  type: 'coding',
                  tier: 'premium',
                }),
              ],
            }
          }

          return { rows: [] }
        },
      }),
    })

    await repository.createDirectInterview({
      id: '22222222-2222-4222-8222-222222222222',
      scheduler_id: '11111111-1111-4111-8111-111111111111',
      scheduler_alias: 'Candidate-Blue',
      interviewer_id: null,
      interviewer_alias: 'Interviewer-Red',
      type: 'coding',
      mode: 'ai_led',
      tier: 'premium',
      status: 'scheduled',
      scheduled_at: '2026-04-13T10:00:00.000Z',
      created_at: '2026-04-13T09:55:00.000Z',
      updated_at: '2026-04-13T09:55:00.000Z',
      policy_consumption: 'credit',
    })

    expect(reservationQueries).toEqual([
      'UPDATE users SET credits = credits - 1, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL AND credits > 0 RETURNING id;',
    ])
  })

  it('rolls back when policy reservation fails', async function run() {
    const executedQueries: string[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(normalizeSql(queryInput.text))

          if (queryInput.text.includes('UPDATE users')) {
            return { rows: [] }
          }

          return { rows: [] }
        },
      }),
    })

    await expect(
      repository.createDirectInterview({
        id: '22222222-2222-4222-8222-222222222222',
        scheduler_id: '11111111-1111-4111-8111-111111111111',
        scheduler_alias: 'Candidate-Blue',
        interviewer_id: null,
        interviewer_alias: 'Interviewer-Red',
        type: 'system_design',
        mode: 'ai_led',
        tier: 'standard',
        status: 'scheduled',
        scheduled_at: '2026-04-13T10:00:00.000Z',
        created_at: '2026-04-13T09:55:00.000Z',
        updated_at: '2026-04-13T09:55:00.000Z',
        policy_consumption: 'free_ai_interview',
      }),
    ).rejects.toBeInstanceOf(InterviewPolicyConflictError)

    expect(executedQueries).toEqual([
      'BEGIN;',
      "UPDATE users SET free_ai_interviews = free_ai_interviews - 1, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL AND free_ai_interviews > 0 RETURNING id;",
      'ROLLBACK;',
    ])
  })

  it('lists participant interviews with deterministic ordering and pagination', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)

          return {
            rows: [
              createInterviewRow({
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                interviewer_id: '11111111-1111-4111-8111-111111111111',
                mode: 'peer_to_peer',
                scheduled_at: '2026-04-13T10:00:00.000Z',
              }),
              createInterviewRow({
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                scheduled_at: '2026-04-13T11:00:00.000Z',
              }),
            ],
          }
        },
      }),
    })

    const interviews = await repository.listParticipantInterviews({
      participant_user_id: '11111111-1111-4111-8111-111111111111',
      limit: 10,
      offset: 20,
    })

    expect(interviews).toHaveLength(2)
    expect(executedQueries).toHaveLength(1)
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toBe(
      'SELECT id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at FROM ( SELECT id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at FROM interviews WHERE scheduler_id = $1 UNION ALL SELECT id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at FROM interviews WHERE interviewer_id = $1 ) AS participant_interviews ORDER BY scheduled_at ASC, id ASC LIMIT $2 OFFSET $3;',
    )
    expect(executedQueries[0]?.values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      10,
      20,
    ])
  })

  it('applies optional status filtering to participant interview lists', async function run() {
    const executedQueries: SqlQuery[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(queryInput)

          return {
            rows: [
              createInterviewRow({
                status: 'scheduled',
              }),
            ],
          }
        },
      }),
    })

    const interviews = await repository.listParticipantInterviews({
      participant_user_id: '11111111-1111-4111-8111-111111111111',
      status: 'scheduled',
    })

    expect(interviews).toEqual([
      expect.objectContaining({
        status: 'scheduled',
      }),
    ])
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain(
      'WHERE scheduler_id = $1 AND status = $2 UNION ALL',
    )
    expect(normalizeSql(executedQueries[0]?.text ?? '')).toContain(
      'WHERE interviewer_id = $1 AND status = $2',
    )
    expect(executedQueries[0]?.values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'scheduled',
      50,
      0,
    ])
  })

  it('cancels scheduled participant interviews atomically', async function run() {
    const executedQueries: string[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(normalizeSql(queryInput.text))

          if (queryInput.text.includes('FROM interviews') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                createInterviewRow({
                  id: '22222222-2222-4222-8222-222222222222',
                  status: 'scheduled',
                }),
              ],
            }
          }

          if (queryInput.text.includes('UPDATE interviews')) {
            return {
              rows: [
                createInterviewRow({
                  id: '22222222-2222-4222-8222-222222222222',
                  status: 'cancelled',
                  updated_at: '2026-04-13T10:05:00.000Z',
                }),
              ],
            }
          }

          return { rows: [] }
        },
      }),
    })

    const result = await repository.cancelInterview({
      interview_id: '22222222-2222-4222-8222-222222222222',
      participant_user_id: '11111111-1111-4111-8111-111111111111',
      updated_at: '2026-04-13T10:05:00.000Z',
    })

    expect(result).toEqual({
      outcome: 'cancelled',
      interview: expect.objectContaining({
        id: '22222222-2222-4222-8222-222222222222',
        status: 'cancelled',
        updated_at: '2026-04-13T10:05:00.000Z',
      }),
    })
    expect(executedQueries).toEqual([
      'BEGIN;',
      'SELECT id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at FROM interviews WHERE id = $1 AND (scheduler_id = $2 OR interviewer_id = $2) LIMIT 1 FOR UPDATE;',
      "UPDATE interviews SET status = 'cancelled', updated_at = $2 WHERE id = $1 RETURNING id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at;",
      'COMMIT;',
    ])
  })

  it('treats cancelling an already-cancelled interview as an idempotent success without mutating state', async function run() {
    const executedQueries: string[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(normalizeSql(queryInput.text))

          if (queryInput.text.includes('FROM interviews') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                createInterviewRow({
                  status: 'cancelled',
                }),
              ],
            }
          }

          return { rows: [] }
        },
      }),
    })

    const result = await repository.cancelInterview({
      interview_id: '22222222-2222-4222-8222-222222222222',
      participant_user_id: '11111111-1111-4111-8111-111111111111',
      updated_at: '2026-04-13T10:05:00.000Z',
    })

    expect(result).toEqual({
      outcome: 'already_cancelled',
      interview: expect.objectContaining({
        status: 'cancelled',
      }),
    })
    expect(executedQueries).toEqual([
      'BEGIN;',
      'SELECT id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at FROM interviews WHERE id = $1 AND (scheduler_id = $2 OR interviewer_id = $2) LIMIT 1 FOR UPDATE;',
      'COMMIT;',
    ])
  })

  it('rejects cancellation for ongoing or completed interviews without updating state', async function run() {
    const executedQueries: string[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(normalizeSql(queryInput.text))

          if (queryInput.text.includes('FROM interviews') && queryInput.text.includes('FOR UPDATE')) {
            return {
              rows: [
                createInterviewRow({
                  status: 'ongoing',
                }),
              ],
            }
          }

          return { rows: [] }
        },
      }),
    })

    const result = await repository.cancelInterview({
      interview_id: '22222222-2222-4222-8222-222222222222',
      participant_user_id: '11111111-1111-4111-8111-111111111111',
      updated_at: '2026-04-13T10:05:00.000Z',
    })

    expect(result).toEqual({
      outcome: 'invalid_status',
      interview: expect.objectContaining({
        status: 'ongoing',
      }),
    })
    expect(executedQueries).toEqual([
      'BEGIN;',
      'SELECT id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at FROM interviews WHERE id = $1 AND (scheduler_id = $2 OR interviewer_id = $2) LIMIT 1 FOR UPDATE;',
      'COMMIT;',
    ])
  })

  it('returns not_found when the participant cannot cancel the interview', async function run() {
    const executedQueries: string[] = []
    const repository = new InterviewRepository({
      queryExecutor: createQueryExecutor({
        onQuery(queryInput) {
          executedQueries.push(normalizeSql(queryInput.text))
          return { rows: [] }
        },
      }),
    })

    const result = await repository.cancelInterview({
      interview_id: '22222222-2222-4222-8222-222222222222',
      participant_user_id: '11111111-1111-4111-8111-111111111111',
      updated_at: '2026-04-13T10:05:00.000Z',
    })

    expect(result).toEqual({ outcome: 'not_found' })
    expect(executedQueries).toEqual([
      'BEGIN;',
      'SELECT id, scheduler_id, scheduler_alias, interviewer_id, interviewer_alias, type, mode, tier, status, scheduled_at, created_at, updated_at FROM interviews WHERE id = $1 AND (scheduler_id = $2 OR interviewer_id = $2) LIMIT 1 FOR UPDATE;',
      'COMMIT;',
    ])
  })
})

function createQueryExecutor(options: {
  onQuery: (queryInput: SqlQuery) => { rows: unknown[] }
}): SqlQueryExecutor {
  return {
    async query<Row>(queryInput: SqlQuery) {
      const result = options.onQuery(queryInput)
      return {
        rows: result.rows as Row[],
      }
    },
  }
}

function createInterviewRow(overrides: Partial<Interview> = {}): Interview {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    scheduler_id: '11111111-1111-4111-8111-111111111111',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'ai_led',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-13T10:00:00.000Z',
    created_at: '2026-04-13T09:55:00.000Z',
    updated_at: '2026-04-13T09:55:00.000Z',
    ...overrides,
  }
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
