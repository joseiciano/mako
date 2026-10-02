import type {
  FeedbackErrorCode,
  FeedbackUnavailableReason,
  RecordingStatus,
} from '@mako/shared'

export type ScoreTier = {
  label: string
  barClassName: string
}

/**
 * Buckets a 0-100 coaching score into a human-readable tier. The numeric
 * score and this label are always rendered together so meaning never
 * depends on color alone.
 */
export function scoreTier(score: number): ScoreTier {
  if (score >= 85) {
    return { label: 'Strong', barClassName: 'bg-emerald-400' }
  }
  if (score >= 70) {
    return { label: 'Solid', barClassName: 'bg-sky-400' }
  }
  if (score >= 50) {
    return { label: 'Developing', barClassName: 'bg-amber-400' }
  }
  return { label: 'Needs focus', barClassName: 'bg-rose-400' }
}

const unavailableReasonCopy: Record<FeedbackUnavailableReason, string> = {
  no_consent:
    "You didn't consent to recording for this session, so an automated feedback report isn't available.",
  unsupported_format:
    "We couldn't generate a report because the session recording format wasn't supported.",
  no_recording:
    'No recording was captured for this session, so a feedback report is not available.',
}

export function describeFeedbackUnavailableReason(
  reason: FeedbackUnavailableReason | null,
): string {
  if (reason && reason in unavailableReasonCopy) {
    return unavailableReasonCopy[reason]
  }
  return 'A feedback report is not available for this session.'
}

const errorCodeCopy: Record<FeedbackErrorCode, string> = {
  assets_not_ready: 'Session assets were not ready in time to generate a report.',
  transcription_failed: 'We were unable to transcribe this session.',
  analysis_failed: 'We ran into a problem analyzing this session.',
  invalid_feedback: 'The generated report did not pass our safety checks.',
  internal_error: 'Something went wrong while generating this report.',
}

export function describeFeedbackErrorCode(code: FeedbackErrorCode | null): string {
  if (code && code in errorCodeCopy) {
    return errorCodeCopy[code]
  }
  return 'Something went wrong while generating this report.'
}

export type RecordingPlaybackState =
  | 'unavailable'
  | 'processing'
  | 'failed'
  | 'expired'
  | 'ready'

/**
 * Derives the recording playback state entirely from already-fetched
 * interview detail fields (`recording_status` and the authorized
 * `recording_url`) rather than issuing a separate probe request:
 * `recording_url` is only ever populated once the backend resolves an
 * available (non-expired) artifact, so a `ready` status paired with a null
 * URL means the 30-day raw retention window has passed.
 */
export function deriveRecordingPlaybackState(
  recordingStatus: RecordingStatus,
  recordingUrl: string | null,
): RecordingPlaybackState {
  if (recordingStatus === 'failed') return 'failed'
  if (recordingStatus === 'not_started') return 'unavailable'
  if (recordingStatus !== 'ready') return 'processing'
  return recordingUrl ? 'ready' : 'expired'
}
