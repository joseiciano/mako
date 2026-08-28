import type { ConsentDecision, InterviewDetail, RecordingStatus } from '@mako/shared'

export type RecordingConsentDumbProps = {
  mode: InterviewDetail['mode']
  interviewStatus: InterviewDetail['status']
  recordingStatus: RecordingStatus
  currentDecision: ConsentDecision | null
  isSubmitting: boolean
  errorMessage: string | null
  onChoose: (decision: ConsentDecision) => void
  onRevoke: () => void
}

function getRuntimeLabel(
  interviewStatus: InterviewDetail['status'],
  recordingStatus: RecordingStatus,
  currentDecision: ConsentDecision | null,
): string {
  if (
    recordingStatus === 'not_started' &&
    (interviewStatus === 'completed' || interviewStatus === 'cancelled')
  ) {
    return 'Not recorded'
  }
  if (recordingStatus === 'not_started' && currentDecision === 'declined') return 'Not recorded'
  if (recordingStatus === 'not_started') return 'Waiting for consent'
  if (recordingStatus === 'pending') return 'Ready to record'
  if (recordingStatus === 'recording') return 'Recording'
  if (recordingStatus === 'processing') return 'Processing upload'
  if (recordingStatus === 'ready') return 'Ready'
  return 'Recording failed'
}

export function RecordingConsentDumb(props: RecordingConsentDumbProps) {
  const isLocked =
    props.recordingStatus !== 'not_started' ||
    props.interviewStatus === 'completed' ||
    props.interviewStatus === 'cancelled'

  const isTerminalLock = props.interviewStatus === 'completed' || props.interviewStatus === 'cancelled'
  const isRecordingLock = props.recordingStatus !== 'not_started'

  const statusLabel = getRuntimeLabel(
    props.interviewStatus,
    props.recordingStatus,
    props.currentDecision,
  )
  const showRevoke = props.currentDecision !== null && !isLocked

  return (
    <section
      aria-label="Recording consent"
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
    >
      <h2 className="text-lg font-semibold text-white">Recording consent</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Your audio and video may be recorded to create a transcript and AI feedback.
        Raw recordings are retained for 30 days, then automatically deleted. You can
        decline without preventing the interview from continuing.
      </p>

      {props.mode === 'ai_led' ? (
        <p className="mt-3 text-sm text-slate-400">
          In this AI-led interview, your recording choice applies to your session with
          the AI interviewer.
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-400">
          In this peer-to-peer interview, recording is available only when the required
          participant consent is in place. This panel shows only your choice.
        </p>
      )}

      <div className="mt-4">
        <p aria-live="polite" className="text-sm font-medium text-slate-300" role="status">
          {statusLabel}
          {props.currentDecision === 'consented' ? ' — You allowed recording. You consented to recording.' : null}
          {props.currentDecision === 'declined' ? ' — You declined recording.' : null}
        </p>
      </div>

      {props.errorMessage ? (
        <div
          className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
          role="alert"
        >
          {props.errorMessage}
        </div>
      ) : null}

      {isTerminalLock ? (
        <p className="mt-3 text-sm text-slate-400">
          Recording choices are no longer available because this interview has ended.
        </p>
      ) : isRecordingLock ? (
        <p className="mt-3 text-sm text-amber-300">
          Your choice is locked because recording preparation has begun. Consent cannot
          be changed after recording starts.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="inline-flex rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          aria-pressed={props.currentDecision === 'consented'}
          disabled={isLocked || props.isSubmitting}
          onClick={function handleAllow() {
            props.onChoose('consented')
          }}
          type="button"
        >
          Allow
        </button>
        <button
          className="inline-flex rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-pressed={props.currentDecision === 'declined'}
          disabled={isLocked || props.isSubmitting}
          onClick={function handleDecline() {
            props.onChoose('declined')
          }}
          type="button"
        >
          Decline
        </button>
        {showRevoke ? (
          <button
            className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={props.isSubmitting}
            onClick={props.onRevoke}
            type="button"
          >
            Revoke choice
          </button>
        ) : null}
      </div>
    </section>
  )
}
