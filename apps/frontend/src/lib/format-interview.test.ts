import { describe, expect, it } from 'vitest'
import {
  formatInterviewMode,
  formatInterviewStatus,
  formatInterviewType,
} from './format-interview'

describe('formatInterviewType', function () {
  it('formats supported interview types', function () {
    expect(formatInterviewType('system_design')).toBe('System Design')
    expect(formatInterviewType('coding')).toBe('Coding')
    expect(formatInterviewType('behavioral')).toBe('Behavioral')
  })
})

describe('formatInterviewMode', function () {
  it('formats supported interview modes', function () {
    expect(formatInterviewMode('peer_to_peer')).toBe('Peer to Peer')
    expect(formatInterviewMode('ai_led')).toBe('AI-led')
  })
})

describe('formatInterviewStatus', function () {
  it('formats supported interview statuses', function () {
    expect(formatInterviewStatus('scheduled')).toBe('Scheduled')
    expect(formatInterviewStatus('ongoing')).toBe('Ongoing')
    expect(formatInterviewStatus('completed')).toBe('Completed')
    expect(formatInterviewStatus('cancelled')).toBe('Cancelled')
  })
})
