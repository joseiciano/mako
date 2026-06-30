import type { InterviewDetail } from '@mako/shared'

export type FeedbackDumbProps = {
  interview: InterviewDetail | null
  isLoading: boolean
  errorMessage: string | null
  onBack: () => void
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
            Review read-only feedback, recording, and whiteboard captures.
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

  if (props.interview.status !== 'completed') {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Feedback not available</h2>
        <p className="mt-2 text-sm text-slate-300">
          Feedback is available after the interview is completed.
        </p>
      </section>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Feedback</h2>
        {props.interview.feedback ? (
          <FeedbackPayload feedback={props.interview.feedback} />
        ) : (
          <p className="mt-3 text-sm text-slate-400">No feedback available.</p>
        )}
      </section>
      <AssetsPanel interview={props.interview} />
    </div>
  )
}

function FeedbackPayload(props: { feedback: unknown }) {
  if (!isRecord(props.feedback)) {
    return <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{String(props.feedback)}</pre>
  }

  const knownKeys = new Set(['overall_score', 'strengths', 'improvements'])
  const fallbackEntries = Object.entries(props.feedback).filter(
    ([key]) => !knownKeys.has(key),
  )

  return (
    <div className="mt-4 flex flex-col gap-5">
      {props.feedback.overall_score !== undefined ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Overall score</p>
          <p className="mt-1 text-3xl font-semibold text-emerald-300">
            {String(props.feedback.overall_score)}
          </p>
        </div>
      ) : null}
      <FeedbackList title="Strengths" value={props.feedback.strengths} />
      <FeedbackList title="Improvements" value={props.feedback.improvements} />
      {fallbackEntries.length > 0 ? (
        <dl className="grid gap-3">
          {fallbackEntries.map(function mapEntry([key, value]) {
            return (
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3" key={key}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{key}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                  {formatFeedbackValue(value)}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : null}
    </div>
  )
}

function FeedbackList(props: { title: string; value: unknown }) {
  if (!Array.isArray(props.value) || props.value.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{props.title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
        {props.value.map(function mapItem(item, index) {
          return <li key={`${props.title}-${index}`}>{String(item)}</li>
        })}
      </ul>
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
      ) : null}
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

function sanitizeMessage(message: string): string {
  if (message.includes('://')) return 'Unable to load feedback. Please try again.'
  return message
}

function formatFeedbackValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
