import { describe, expect, it } from 'vitest'
import type { SqlQuery } from '../index'
import { RecordingControlRepository } from './recording-control-repository'

const input = {
  interview_id: 'int-1',
  claim_id: 'claim-1',
  now: '2026-01-01T00:01:00.000Z',
  stale_before: '2026-01-01T00:00:00.000Z',
}

function executor(responses: unknown[][]) {
  const queries: SqlQuery[] = []
  return {
    queries,
    async query<Row>(query: SqlQuery) {
      queries.push(query)
      const rows = (responses.shift() ?? []) as Row[]
      return { rows, rowCount: rows.length }
    },
  }
}

const claimRow = {
  interview_id: 'int-1',
  scheduler_id: 's',
  interviewer_id: null,
  realtime_session_id: 'meeting-1',
}

function locked(overrides: Record<string, unknown> = {}) {
  return { status: 'ongoing', recording_status: 'not_started', scheduler_id: 's', interviewer_id: null, realtime_session_id: 'meeting-1', ...overrides }
}

const texts = (ex: ReturnType<typeof executor>) => ex.queries.map((q) => q.text.trim())

describe('RecordingControlRepository.claimStart', function suite() {
  it('locks the interview row, counts consents in a separate statement, then claims, in one transaction', async function run() {
    const ex = executor([[], [locked()], [{ consent_count: '1' }], [claimRow], []])
    const result = await new RecordingControlRepository(ex).claimStart(input)

    expect(result).toMatchObject({ outcome: 'claimed', context: { takeover: false, claim_id: 'claim-1' } })
    const sql = texts(ex)
    expect(sql[0]).toBe('BEGIN;')
    expect(sql[1]).toContain('FOR UPDATE')
    expect(sql[2]).toContain("decision = 'consented'")
    expect(sql[2]).toContain('revoked_at IS NULL')
    expect(sql[2]).not.toContain('UPDATE')
    expect(sql[3]).toContain("recording_status = 'pending'")
    expect(sql[3]).toContain("i.recording_status = 'not_started'")
    expect(sql[4]).toBe('COMMIT;')
  })

  it('does not claim when a required consent is missing or revoked', async function run() {
    const ex = executor([[], [locked({ interviewer_id: 'i' })], [{ consent_count: '1' }], []])
    expect(await new RecordingControlRepository(ex).claimStart(input)).toEqual({ outcome: 'not_eligible' })
    expect(texts(ex).some((t) => t.includes('UPDATE interviews'))).toBe(false)
    expect(texts(ex).at(-1)).toBe('COMMIT;')
  })

  it('takes over only a stale pending claim', async function run() {
    const ex = executor([[], [locked({ recording_status: 'pending' })], [claimRow], []])
    const result = await new RecordingControlRepository(ex).claimStart(input)
    expect(result).toMatchObject({ outcome: 'claimed', context: { takeover: true } })
    expect(texts(ex)[2]).toContain('i.recording_start_claimed_at < $4')
  })

  it.each([
    ['pending', [[], [locked({ recording_status: 'pending' })], [], []], 'in_progress'],
    ['recording', [[], [locked({ recording_status: 'recording' })], []], 'already_started'],
  ] as const)('reports %s as %s when no claim is won', async function run(_s, responses, outcome) {
    const ex = executor(responses.map((r) => [...r]))
    expect(await new RecordingControlRepository(ex).claimStart(input)).toEqual({ outcome })
  })

  it('reports a non-ongoing interview as not_eligible', async function run() {
    const ex = executor([[], [locked({ status: 'scheduled' })], []])
    expect(await new RecordingControlRepository(ex).claimStart(input)).toEqual({ outcome: 'not_eligible' })
  })

  it('rolls back when a statement fails', async function run() {
    const ex = executor([[]])
    const failing = {
      ...ex,
      async query<Row>(query: SqlQuery) {
        if (query.text.includes('FOR UPDATE')) throw new Error('boom')
        return ex.query<Row>(query)
      },
    }
    await expect(new RecordingControlRepository(failing).claimStart(input)).rejects.toThrow('boom')
    expect(texts(ex)).toContain('ROLLBACK;')
  })
})
