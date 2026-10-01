/**
 * Pure classification of `interview_recordings` job state for Story 5.18
 * artifact-readiness orchestration. Kept separate from the workflow and
 * repository so the retryable/non-retryable decision is independently unit
 * testable without a database or Workflow runtime.
 */
export type RecordingJobRow = {
  recording_type: 'composite' | 'participant_track'
  finalization_status: 'pending' | 'processing' | 'finalized' | 'failed'
  error_code: string | null
}

export type RecordingJobsClassification =
  /** No `interview_recordings` row exists at all: recording never started. */
  | 'no_recording'
  /** At least one required job is still in flight; keep polling. */
  | 'waiting'
  /** Every job reached a terminal state and at least one failure is a
   *  permanent format/participant-mapping problem that bounded waiting
   *  cannot resolve. */
  | 'format_or_mapping_failure'
  /** Every job reached a terminal state and at least one failure is an
   *  infrastructure/provider/storage problem outside this pipeline's
   *  control. Bounded waiting is exhausted rather than retried forever. */
  | 'infrastructure_failure'
  /** No job is pending/processing or failed: fall through to checking
   *  whether `interview_artifacts` actually has the required finalized
   *  tracks. */
  | 'ready_for_track_check'

/**
 * `interview_recordings.error_code` values written by
 * `RecordingFinalizationWorkflow` for a permanent, deterministic
 * participant-track format or role-mapping problem (see
 * `toSafeCode('mapping' | 'validation')` in `recording-finalization-workflow.ts`).
 * These never resolve by waiting longer, unlike transport/storage/database
 * errors which the finalization workflow's own retries/sweep may still
 * recover from.
 */
const FORMAT_OR_MAPPING_ERROR_CODES: ReadonlySet<string> = new Set(['mapping_error', 'validation_error'])

export function classifyRecordingJobs(rows: readonly RecordingJobRow[]): RecordingJobsClassification {
  if (rows.length === 0) {
    return 'no_recording'
  }

  const anyInFlight = rows.some(
    (row) => row.finalization_status === 'pending' || row.finalization_status === 'processing',
  )
  if (anyInFlight) {
    return 'waiting'
  }

  const failedRows = rows.filter((row) => row.finalization_status === 'failed')
  if (failedRows.length > 0) {
    const permanentFailure = failedRows.some(
      (row) => row.error_code !== null && FORMAT_OR_MAPPING_ERROR_CODES.has(row.error_code),
    )
    return permanentFailure ? 'format_or_mapping_failure' : 'infrastructure_failure'
  }

  return 'ready_for_track_check'
}
