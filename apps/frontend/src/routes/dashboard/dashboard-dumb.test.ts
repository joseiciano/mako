import { describe, expect, it } from 'vitest'
import {
  formatInterviewMode,
  formatInterviewStatus,
  formatInterviewType,
  formatScheduledTime,
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

  it('handles invalid schedule strings safely', function run() {
    expect(formatScheduledTime('not-a-date')).toBe('Unknown scheduled time')
  })
})
