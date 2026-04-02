import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { MatcherRepository } from './matcher-repository'

describe('MatcherRepository', function matcherRepositorySuite() {
  it('queries only active and available future candidates in deterministic order', async function shouldBuildCandidateQuery() {
    const executedQueries: SqlQuery[] = []
    const repository = new MatcherRepository({
      query: async function query<Row>(queryInput: SqlQuery) {
        executedQueries.push(queryInput)

        return {
          rows: [
            {
              request_id: '11111111-1111-4111-8111-111111111111',
              request_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              request_created_at: '2026-04-01T00:00:00.000Z',
              interview_type: 'system_design',
              slot_id: '22222222-2222-4222-8222-222222222222',
              slot_start_time: '2026-04-05T10:00:00.000Z',
              slot_end_time: '2026-04-05T11:00:00.000Z',
            },
          ] as Row[],
        }
      },
    })

    const candidates = await repository.listCandidateRows()

    expect(candidates).toHaveLength(1)
    expect(executedQueries).toHaveLength(1)
    expect(executedQueries[0]?.text).toContain("slots.status = 'available'")
    expect(executedQueries[0]?.text).toContain("requests.status = 'active'")
    expect(executedQueries[0]?.text).toContain(
      'requests.current_matches < requests.max_matches',
    )
    expect(executedQueries[0]?.text).toContain('slots.start_time > NOW()')
    expect(executedQueries[0]?.text).toContain('requests.created_at ASC')
    expect(executedQueries[0]?.text).toContain('requests.id ASC')
    expect(executedQueries[0]?.text).toContain('slots.start_time ASC')
    expect(executedQueries[0]?.text).toContain('slots.id ASC')
    expect(executedQueries[0]?.values).toEqual([])
  })
})
