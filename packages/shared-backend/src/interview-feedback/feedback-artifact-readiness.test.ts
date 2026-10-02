import { describe, expect, it } from 'vitest'
import { classifyRecordingJobs, type RecordingJobRow } from './feedback-artifact-readiness'

function job(overrides: Partial<RecordingJobRow> = {}): RecordingJobRow {
  return {
    recording_type: 'participant_track',
    finalization_status: 'finalized',
    error_code: null,
    ...overrides,
  }
}

describe('classifyRecordingJobs', function () {
  it('returns no_recording when there are no interview_recordings rows', function () {
    expect(classifyRecordingJobs([])).toBe('no_recording')
  })

  it('returns waiting when any job is pending', function () {
    expect(classifyRecordingJobs([job({ finalization_status: 'pending' })])).toBe('waiting')
  })

  it('returns waiting when any job is processing, even if others are finalized', function () {
    expect(
      classifyRecordingJobs([
        job({ finalization_status: 'finalized' }),
        job({ finalization_status: 'processing' }),
      ]),
    ).toBe('waiting')
  })

  it('returns ready_for_track_check when every job finalized', function () {
    expect(
      classifyRecordingJobs([
        job({ recording_type: 'composite' }),
        job({ recording_type: 'participant_track' }),
      ]),
    ).toBe('ready_for_track_check')
  })

  it('returns format_or_mapping_failure for a terminal mapping_error', function () {
    expect(
      classifyRecordingJobs([job({ finalization_status: 'failed', error_code: 'mapping_error' })]),
    ).toBe('format_or_mapping_failure')
  })

  it('returns format_or_mapping_failure for a terminal validation_error', function () {
    expect(
      classifyRecordingJobs([job({ finalization_status: 'failed', error_code: 'validation_error' })]),
    ).toBe('format_or_mapping_failure')
  })

  it('returns infrastructure_failure for a terminal provider_error', function () {
    expect(
      classifyRecordingJobs([job({ finalization_status: 'failed', error_code: 'provider_error' })]),
    ).toBe('infrastructure_failure')
  })

  it('returns infrastructure_failure for a terminal storage_error', function () {
    expect(
      classifyRecordingJobs([job({ finalization_status: 'failed', error_code: 'storage_error' })]),
    ).toBe('infrastructure_failure')
  })

  it('returns infrastructure_failure when error_code is missing on a failed row', function () {
    expect(classifyRecordingJobs([job({ finalization_status: 'failed', error_code: null })])).toBe(
      'infrastructure_failure',
    )
  })

  it('prefers format_or_mapping_failure when mixed with an infrastructure failure', function () {
    expect(
      classifyRecordingJobs([
        job({ finalization_status: 'failed', error_code: 'provider_error' }),
        job({ finalization_status: 'failed', error_code: 'mapping_error' }),
      ]),
    ).toBe('format_or_mapping_failure')
  })

  it('never waits forever on an all-failed set with no in-flight jobs', function () {
    const result = classifyRecordingJobs([job({ finalization_status: 'failed', error_code: 'database_error' })])
    expect(result).not.toBe('waiting')
  })
})
