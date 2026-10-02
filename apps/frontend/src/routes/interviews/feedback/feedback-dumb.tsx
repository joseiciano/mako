import type { InterviewDetail } from '@mako/shared'
import type { FeedbackReportErrorKind } from '#/hooks/use-feedback-report'
import {
  describeFeedbackErrorCode,
  describeFeedbackUnavailableReason,
} from './feedback-report-helpers'
import { FeedbackScoreReport } from './feedback-score-report'

export type FeedbackDumbProps = {
  interview: InterviewDetail | null
  isLoading: boolean
  errorKind: FeedbackReportErrorKind | null
  recordingUrl: string | null
  screenshotUrls: string[]
  isPolling: boolean
  hasReachedPollingDeadline: boolean
  onBack: () => void
  onRefresh: () => void
  onSignIn: () => void
}

export function FeedbackDumb(props: FeedbackDumbProps) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
            Interviews
          </p>
          <h1 className="text-2xl font-semibold text-white">Post-Interview Feedback</h1>
          <p className="mt-2 text-sm text-slate-300">
            Review your coaching report, transcript, recording, and whiteboard captures.
          </p>
        </div>
        <button
          className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          onClick={props.onBack}
          type="button"
        >
          Back to details
        </button>
      </header>

      {renderContent(props)}
    </main>
  )
}

function renderContent(props: FeedbackDumbProps) {
  if (props.isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <p aria-live="polite" className="text-slate-300" role="status">
          Loading feedback...
        </p>
      </section>
    )
  }

  if (props.errorKind === 'not-found') {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6" role="alert">
        <h2 className="text-lg font-semibold text-white">Report not found</h2>
        <p className="mt-2 text-sm text-slate-300">
          This interview report isn&apos;t available, or you don&apos;t have access to it.
        </p>
      </section>
    )
  }

  if (props.errorKind === 'unauthenticated') {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6" role="alert">
        <h2 className="text-lg font-semibold text-white">Sign in required</h2>
        <p className="mt-2 text-sm text-slate-300">
          Your session has expired. Sign in again to view this report.
        </p>
        <button
          className="mt-4 inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          onClick={props.onSignIn}
          type="button"
        >
          Sign in
        </button>
      </section>
    )
  }

  if (props.errorKind === 'network') {
    return (
      <section
        className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200"
        role="alert"
      >
        <p>Unable to load this report. Please check your connection and try again.</p>
        <button
          className="mt-3 inline-flex rounded-md border border-red-700 px-3 py-1.5 text-sm font-medium text-red-100 transition hover:bg-red-900/50"
          onClick={props.onRefresh}
          type="button"
        >
          Try again
        </button>
      </section>
    )
  }

  if (!props.interview) return null

  if (props.interview.status !== 'completed') {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Feedback not available yet</h2>
        <p className="mt-2 text-sm text-slate-300">
          Feedback is available after this interview is completed.
        </p>
      </section>
    )
  }

  const interview = props.interview

  if (interview.feedback_status === 'pending' || interview.feedback_status === 'processing') {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Generating your feedback report</h2>
        <p aria-live="polite" className="mt-2 text-sm text-slate-300" role="status">
          {interview.feedback_status === 'pending'
            ? 'Your session is queued for analysis.'
            : "We're transcribing and analyzing your session. This can take a few minutes."}
        </p>
        {props.isPolling ? (
          <p className="mt-2 text-xs text-slate-500">Automatically checking for updates…</p>
        ) : null}
        {props.hasReachedPollingDeadline ? (
          <div className="mt-4">
            <p className="text-sm text-amber-200">This is taking longer than expected.</p>
            <button
              className="mt-2 inline-flex rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              onClick={props.onRefresh}
              type="button"
            >
              Check again
            </button>
          </div>
        ) : null}
      </section>
    )
  }

  if (interview.feedback_status === 'failed') {
    return (
      <section className="rounded-xl border border-amber-900 bg-amber-950/30 p-6" role="alert">
        <h2 className="text-lg font-semibold text-white">We couldn&apos;t generate your report</h2>
        <p className="mt-2 text-sm text-amber-100">
          {describeFeedbackErrorCode(interview.feedback_error_code)} This sometimes resolves
          automatically — check back later, or contact support if it persists.
        </p>
        <button
          className="mt-4 inline-flex rounded-md border border-amber-700 px-3 py-1.5 text-sm font-medium text-amber-100 transition hover:bg-amber-900/40"
          onClick={props.onRefresh}
          type="button"
        >
          Check again
        </button>
      </section>
    )
  }

  if (interview.feedback_status === 'ready' && interview.feedback) {
    return (
      <FeedbackScoreReport
        feedback={interview.feedback}
        generatedAt={interview.feedback_generated_at}
        promptVersion={interview.feedback_prompt_version}
        recordingStatus={interview.recording_status}
        recordingUrl={props.recordingUrl}
        screenshotUrls={props.screenshotUrls}
        transcript={interview.transcript}
      />
    )
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold text-white">Feedback not available</h2>
      <p className="mt-2 text-sm text-slate-300">
        {describeFeedbackUnavailableReason(interview.feedback_unavailable_reason)}
      </p>
    </section>
  )
}
