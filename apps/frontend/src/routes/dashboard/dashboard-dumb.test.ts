import { describe, expect, it } from 'vitest'
import { formatScheduledTime } from '#/lib/format-scheduled-time'
import {
  formatInterviewMode,
  formatInterviewStatus,
  formatInterviewType,
  selectCounterpartAlias,
} from './dashboard-dumb'

describe('dashboard-dumb formatting helpers', function dashboardDumbHelpersSuite() {
  it('selects interviewer alias when viewer is scheduler', function run() {
    const alias = selectCounterpartAlias('user-1', {
      scheduler_id: 'user-1',
      scheduler_alias: 'Candidate-Blue',
      interviewer_alias: 'Interviewer-Red',
    })

    expect(alias).toBe('Interviewer-Red')
  })

  it('selects scheduler alias when viewer is not scheduler', function run() {
    const alias = selectCounterpartAlias('user-2', {
      scheduler_id: 'user-1',
      scheduler_alias: 'Candidate-Blue',
      interviewer_alias: 'Interviewer-Red',
    })

    expect(alias).toBe('Candidate-Blue')
  })

  it('formats documented interview contract values', function run() {
    expect(formatInterviewType('system_design')).toBe('System Design')
    expect(formatInterviewMode('peer_to_peer')).toBe('Peer to Peer')
    expect(formatInterviewStatus('scheduled')).toBe('Scheduled')
  })

  it('formats scheduled time in local time', function run() {
    const iso = '2026-04-10T10:30:00.000Z'
    const expected = new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    expect(formatScheduledTime(iso)).toBe(expected)
  })

  it('handles invalid schedule strings safely', function run() {
    expect(formatScheduledTime('not-a-date')).toBe('Unknown scheduled time')
  })
})
