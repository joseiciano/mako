import type { InterviewDetail } from '@mako/shared'
import type { SessionStatus } from './session-flow'
import {
  formatInterviewType,
  formatInterviewMode,
  formatInterviewStatus,
} from '#/lib/format-interview'

export type SessionDumbProps = {
  interview: InterviewDetail | null
  isLoading: boolean
  status: SessionStatus
  errorMessage: string | null
  onJoin: () => void
  onBackToInterviews: () => void
}

export function SessionDumb(props: SessionDumbProps) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
            Interviews
          </p>
          <h1 className="text-2xl font-semibold text-white">Session</h1>
          <p className="mt-2 text-sm text-slate-300">
            Interview session with whiteboard collaboration.
          </p>
        </div>
        <button
          className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          onClick={props.onBackToInterviews}
          type="button"
        >
          Back to interviews
        </button>
      </header>

      {renderContent(props)}
    </main>
  )
}

function renderContent(props: SessionDumbProps) {
  if (props.isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <p
          aria-live="polite"
          className="text-slate-300"
          role="status"
        >
          Loading interview details...
        </p>
      </section>
    )
  }

  if (props.status === 'joining') {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <p
          aria-live="polite"
          className="text-slate-300"
          role="status"
        >
          Joining session...
        </p>
      </section>
    )
  }

  if (props.status === 'provisioned') {
    return (
      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <InterviewMetadata interview={props.interview} />
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Whiteboard</h2>
          <p className="mt-2 text-sm text-slate-300">
            Excalidraw whiteboard will load here.
          </p>
          <div className="mt-4 rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-12 text-center">
            <p className="text-sm text-slate-500">
              Whiteboard integration (Story 3.4+)
            </p>
          </div>
        </section>
      </div>
    )
  }

  if (props.errorMessage) {
    return (
      <section
        className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200"
        role="alert"
      >
        <p>{props.errorMessage}</p>
        {props.interview ? (
          <button
            className="mt-3 inline-flex rounded-md border border-red-400 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
            onClick={props.onJoin}
            type="button"
          >
            Retry
          </button>
        ) : null}
      </section>
    )
  }

  if (props.interview) {
    return (
      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <InterviewMetadata interview={props.interview} />
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Ready to Join</h2>
          <p className="mt-2 text-sm text-slate-300">
            Click the button below to provision your whiteboard session and
            enter the interview environment.
          </p>
          <button
            className="mt-4 inline-flex rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            onClick={props.onJoin}
            type="button"
          >
            Join Session
          </button>
        </section>
      </div>
    )
  }

  return null
}

function InterviewMetadata(props: { interview: InterviewDetail | null }) {
  if (!props.interview) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Interview Details</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-400">Type</p>
          <p className="text-sm text-slate-200">
            {formatInterviewType(props.interview.type)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Mode</p>
          <p className="text-sm text-slate-200">
            {formatInterviewMode(props.interview.mode)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Status</p>
          <p className="text-sm text-slate-200">
            {formatInterviewStatus(props.interview.status)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Counterpart</p>
          <p className="text-sm text-slate-200">
            {props.interview.interviewer_alias}
          </p>
        </div>
      </div>
    </div>
  )
}
