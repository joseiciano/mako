import { describe, expect, it } from 'vitest'
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
                {
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
                },
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
                {
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
                },
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

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
