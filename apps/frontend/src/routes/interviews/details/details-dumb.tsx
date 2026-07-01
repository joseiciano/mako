import type { InterviewDetail } from '@mako/shared'
import {
  formatInterviewMode,
  formatInterviewStatus,
  formatInterviewType,
} from '#/lib/format-interview'
import { formatScheduledTime } from '#/lib/format-scheduled-time'

export type DetailsDumbProps = {
  interview: InterviewDetail | null
  isLoading: boolean
  errorMessage: string | null
  canJoin: boolean
  canViewFeedback: boolean
  onBack: () => void
  onJoin: () => void
  onViewFeedback: () => void
}

export function DetailsDumb(props: DetailsDumbProps) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
            Interviews
          </p>
          <h1 className="text-2xl font-semibold text-white">Interview Details</h1>
          <p className="mt-2 text-sm text-slate-300">
            Review canonical interview status, participants, and post-session assets.
          </p>
        </div>
        <button
          className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          onClick={props.onBack}
          type="button"
        >
          Back to interviews
        </button>
      </header>

      {renderContent(props)}
    </main>
  )
}

function renderContent(props: DetailsDumbProps) {
  if (props.isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <p aria-live="polite" className="text-slate-300" role="status">
          Loading interview details...
        </p>
      </section>
    )
  }

  if (props.errorMessage) {
    return (
      <section
        className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200"
        role="alert"
      >
        {sanitizeMessage(props.errorMessage)}
      </section>
    )
  }

  if (!props.interview) return null

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Overview</h2>
            <div className="flex flex-wrap gap-2">
              {props.canJoin ? (
                <button
                  className="inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                  onClick={props.onJoin}
                  type="button"
                >
                  Join Session
                </button>
              ) : null}
              {props.canViewFeedback ? (
                <button
                  className="inline-flex rounded-lg border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                  onClick={props.onViewFeedback}
                  type="button"
                >
                  View Feedback
                </button>
              ) : null}
            </div>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Type" value={formatInterviewType(props.interview.type)} />
            <DetailItem label="Mode" value={formatInterviewMode(props.interview.mode)} />
            <DetailItem label="Tier" value={formatTier(props.interview.tier)} />
            <DetailItem label="Status" value={formatInterviewStatus(props.interview.status)} />
            <DetailItem
              label="Scheduled time"
              value={formatScheduledTime(props.interview.scheduled_at)}
            />
            <DetailItem label="Scheduler" value={props.interview.scheduler_alias} />
            <DetailItem label="Interviewer" value={props.interview.interviewer_alias} />
          </dl>
        </div>
      </section>

      <aside className="flex flex-col gap-6">
        <AssetsPanel interview={props.interview} />
        <FeedbackSummary interview={props.interview} />
      </aside>
    </div>
  )
}

function DetailItem(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{props.label}</dt>
      <dd className="mt-1 text-sm text-slate-200">{props.value}</dd>
    </div>
  )
}

function AssetsPanel(props: { interview: InterviewDetail }) {
  const screenshots = props.interview.screenshot_urls ?? []

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold text-white">Session assets</h2>
      {props.interview.recording_url ? (
        <a
          className="mt-3 inline-flex text-sm font-medium text-emerald-200 underline-offset-4 hover:underline"
          href={props.interview.recording_url}
          rel="noreferrer"
          target="_blank"
        >
          Open recording
        </a>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No recording available.</p>
      )}

      {screenshots.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {screenshots.map(function mapScreenshot(url, index) {
            return (
              <li key={url}>
                <a
                  className="text-sm font-medium text-emerald-200 underline-offset-4 hover:underline"
                  href={url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Screenshot {index + 1}
                </a>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

function FeedbackSummary(props: { interview: InterviewDetail }) {
  if (!props.interview.feedback) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Feedback summary</h2>
        <p className="mt-3 text-sm text-slate-400">No feedback available.</p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold text-white">Feedback summary</h2>
      <p className="mt-3 text-sm text-slate-300">
        {selectFeedbackSummary(props.interview.feedback)}
      </p>
    </section>
  )
}

function selectFeedbackSummary(feedback: unknown): string {
  if (isRecord(feedback) && typeof feedback.summary === 'string') {
    return feedback.summary
  }

  return 'Feedback is available for this interview.'
}

function sanitizeMessage(message: string): string {
  if (message.includes('://')) return 'Unable to load interview details. Please try again.'
  return message
}

function formatTier(value: InterviewDetail['tier']): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
