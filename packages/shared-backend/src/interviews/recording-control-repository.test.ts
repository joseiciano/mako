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

describe('RecordingControlRepository.claimStart', function suite() {
  it('claims with a single compare-and-set UPDATE gated on ongoing, not_started and active consents', async function run() {
    const ex = executor([[claimRow]])
    const result = await new RecordingControlRepository(ex).claimStart(input)

    expect(result).toMatchObject({ outcome: 'claimed', context: { takeover: false, claim_id: 'claim-1' } })
    const sql = ex.queries[0]!.text
    expect(sql).toContain("i.status = 'ongoing'")
    expect(sql).toContain("i.recording_status = 'not_started'")
    expect(sql).toContain("rc.decision = 'consented'")
    expect(sql).toContain('rc.revoked_at IS NULL')
    expect(sql).toContain('CASE WHEN i.interviewer_id IS NULL THEN 1 ELSE 2 END')
  })

  it('takes over only a stale pending claim', async function run() {
    const ex = executor([[], [claimRow]])
    const result = await new RecordingControlRepository(ex).claimStart(input)
    expect(result).toMatchObject({ outcome: 'claimed', context: { takeover: true } })
    expect(ex.queries[1]!.text).toContain("i.recording_status = 'pending'")
    expect(ex.queries[1]!.text).toContain('i.recording_start_claimed_at < $4')
  })

  it.each([
    ['pending', 'in_progress'],
    ['recording', 'already_started'],
    ['not_started', 'not_eligible'],
  ] as const)('reports %s as %s when no claim is won', async function run(recordingStatus, outcome) {
    const ex = executor([[], [], [{ status: 'ongoing', recording_status: recordingStatus }]])
    expect(await new RecordingControlRepository(ex).claimStart(input)).toEqual({ outcome })
  })

  it('reports a non-ongoing interview as not_eligible', async function run() {
    const ex = executor([[], [], [{ status: 'scheduled', recording_status: 'not_started' }]])
    expect(await new RecordingControlRepository(ex).claimStart(input)).toEqual({ outcome: 'not_eligible' })
  })
})
