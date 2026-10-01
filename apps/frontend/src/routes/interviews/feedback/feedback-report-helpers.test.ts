import { describe, expect, it } from 'vitest'
import {
  describeFeedbackErrorCode,
  describeFeedbackUnavailableReason,
  deriveRecordingPlaybackState,
  scoreTier,
} from './feedback-report-helpers'

describe('scoreTier', function suite() {
  it('labels high scores as Strong', function run() {
    expect(scoreTier(95).label).toBe('Strong')
    expect(scoreTier(85).label).toBe('Strong')
  })

  it('labels mid-high scores as Solid', function run() {
    expect(scoreTier(84).label).toBe('Solid')
    expect(scoreTier(70).label).toBe('Solid')
  })

  it('labels mid scores as Developing', function run() {
    expect(scoreTier(69).label).toBe('Developing')
    expect(scoreTier(50).label).toBe('Developing')
  })

  it('labels low scores as Needs focus', function run() {
    expect(scoreTier(49).label).toBe('Needs focus')
    expect(scoreTier(0).label).toBe('Needs focus')
  })
})

describe('describeFeedbackUnavailableReason', function suite() {
  it('describes no_consent', function run() {
    expect(describeFeedbackUnavailableReason('no_consent')).toMatch(/consent/i)
  })

  it('describes unsupported_format', function run() {
    expect(describeFeedbackUnavailableReason('unsupported_format')).toMatch(/format/i)
  })

  it('describes no_recording', function run() {
    expect(describeFeedbackUnavailableReason('no_recording')).toMatch(/recording/i)
  })

  it('falls back to a generic message when reason is null', function run() {
    expect(describeFeedbackUnavailableReason(null)).toMatch(/not available/i)
  })
})

describe('describeFeedbackErrorCode', function suite() {
  it('describes every known error code without leaking provider text', function run() {
    expect(describeFeedbackErrorCode('assets_not_ready')).not.toContain('://')
    expect(describeFeedbackErrorCode('transcription_failed')).not.toContain('://')
    expect(describeFeedbackErrorCode('analysis_failed')).not.toContain('://')
    expect(describeFeedbackErrorCode('invalid_feedback')).not.toContain('://')
    expect(describeFeedbackErrorCode('internal_error')).not.toContain('://')
  })

  it('falls back to a generic message when code is null', function run() {
    expect(describeFeedbackErrorCode(null)).toMatch(/went wrong/i)
  })
})

describe('deriveRecordingPlaybackState', function suite() {
  it('is unavailable when recording never started', function run() {
    expect(deriveRecordingPlaybackState('not_started', null)).toBe('unavailable')
  })

  it('is processing while pending, recording, or processing', function run() {
    expect(deriveRecordingPlaybackState('pending', null)).toBe('processing')
    expect(deriveRecordingPlaybackState('recording', null)).toBe('processing')
    expect(deriveRecordingPlaybackState('processing', null)).toBe('processing')
  })

  it('is failed when recording processing failed', function run() {
    expect(deriveRecordingPlaybackState('failed', null)).toBe('failed')
  })

  it('is expired when ready but the authorized URL is absent', function run() {
    expect(deriveRecordingPlaybackState('ready', null)).toBe('expired')
  })

  it('is ready when ready and the authorized URL is present', function run() {
    expect(deriveRecordingPlaybackState('ready', '/api/interviews/1/artifacts/recording')).toBe(
      'ready',
    )
  })
})
