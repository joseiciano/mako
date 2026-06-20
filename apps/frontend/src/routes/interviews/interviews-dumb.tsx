import type { InterviewListItem } from '@mako/shared'
import { formatScheduledTime } from '#/lib/format-scheduled-time'

export type InterviewsState = 'loading' | 'error' | 'empty' | 'populated'

export type CancelStatus = {
  type: 'success' | 'error'
  message: string
}

export type InterviewsDumbProps = {
  state: InterviewsState
  upcomingInterviews?: InterviewListItem[]
  historyInterviews?: InterviewListItem[]
  errorMessage?: string
  cancelStatus?: CancelStatus | null
  cancellingInterviewId?: string | null
  onCancelInterview?: (id: string) => void
  onNavigateToNewInterview?: () => void
  onNavigateToSession?: (id: string) => void
}

export function InterviewsDumb(props: InterviewsDumbProps) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
        <div>
          <h1 className="text-2xl font-semibold text-white">Interviews</h1>
          <p className="mt-2 text-sm text-slate-300">
            Manage your upcoming and past interview sessions.
          </p>
        </div>
        <button
          className="inline-flex rounded-md border border-emerald-400 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
          onClick={props.onNavigateToNewInterview}
          type="button"
        >
          Schedule new interview
        </button>
      </header>

      {renderCancelStatus(props.cancelStatus)}
      {renderContent(props)}
    </main>
  )
}

function renderCancelStatus(status: CancelStatus | null | undefined) {
  if (!status) {
    return null
  }

  if (status.type === 'success') {
    return (
      <p
        aria-live="polite"
        className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-emerald-200"
        role="status"
      >
        {status.message}
      </p>
    )
  }

  return (
    <section
      className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200"
      role="alert"
    >
      <p>{status.message}</p>
    </section>
  )
}

function renderContent(props: InterviewsDumbProps) {
  if (props.state === 'loading') {
    return (
      <p
        aria-live="polite"
        className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300"
        role="status"
      >
        Loading interviews...
      </p>
    )
  }

  if (props.state === 'error') {
    return (
      <section className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200">
        <p role="alert">
          {props.errorMessage ?? 'Unable to load interviews.'}
        </p>
      </section>
    )
  }

  const upcoming = props.upcomingInterviews ?? []
  const history = props.historyInterviews ?? []

  if (props.state === 'empty' || (upcoming.length === 0 && history.length === 0)) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <p className="text-slate-300">No interviews found.</p>
        <button
          className="mt-4 inline-flex rounded-md border border-emerald-400 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
          onClick={props.onNavigateToNewInterview}
          type="button"
        >
          Schedule new interview
        </button>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Upcoming</h2>
          <div className="mt-4 overflow-x-auto">
            <InterviewTable
              interviews={upcoming}
              showCancel
              showJoin
              cancellingInterviewId={props.cancellingInterviewId}
              onCancelInterview={props.onCancelInterview}
              onNavigateToSession={props.onNavigateToSession}
            />
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">History</h2>
          <div className="mt-4 overflow-x-auto">
            <InterviewTable interviews={history} />
          </div>
        </section>
      )}
    </div>
  )
}

type InterviewTableProps = {
  interviews: InterviewListItem[]
  showCancel?: boolean
  showJoin?: boolean
  cancellingInterviewId?: string | null
  onCancelInterview?: (id: string) => void
  onNavigateToSession?: (id: string) => void
}

function InterviewTable(props: InterviewTableProps) {
  return (
    <table className="min-w-full border-separate border-spacing-y-2" role="table">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="px-3 py-1" scope="col">
            Type
          </th>
          <th className="px-3 py-1" scope="col">
            Mode
          </th>
          <th className="px-3 py-1" scope="col">
            Status
          </th>
          <th className="px-3 py-1" scope="col">
            Scheduled time
          </th>
          <th className="px-3 py-1" scope="col">
            Counterpart
          </th>
          {props.showCancel && <th className="px-3 py-1" scope="col" />}
          {props.showJoin && <th className="px-3 py-1" scope="col" />}
        </tr>
      </thead>

      <tbody>
        {props.interviews.map(function mapInterview(interview) {
          const isCancelling = props.cancellingInterviewId === interview.id
          const canCancel =
            props.showCancel &&
            interview.status === 'scheduled' &&
            !isCancelling
          const canJoinSession =
            props.showJoin &&
            (interview.status === 'scheduled' || interview.status === 'ongoing')
          const hasBothColumns = props.showJoin && props.showCancel

          return (
            <tr
              className="rounded-lg border border-slate-800 bg-slate-950/70 text-sm text-slate-200"
              key={interview.id}
            >
              <td className="rounded-l-lg px-3 py-3">
                {formatInterviewType(interview.type)}
              </td>
              <td className="px-3 py-3">
                {formatInterviewMode(interview.mode)}
              </td>
              <td className="px-3 py-3">
                {formatInterviewStatus(interview.status)}
              </td>
              <td className="px-3 py-3">
                <time dateTime={interview.scheduled_at}>
                  {formatScheduledTime(interview.scheduled_at)}
                </time>
              </td>
              <td className="px-3 py-3">{interview.interviewer_alias}</td>
              {props.showJoin && (
                <td className={!hasBothColumns ? 'rounded-r-lg px-3 py-3' : 'px-3 py-3'}>
                  {canJoinSession ? (
                    <button
                      aria-label={`Join session ${interview.id}`}
                      className="inline-flex rounded-md border border-emerald-400 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                      onClick={function handleJoin() {
                        props.onNavigateToSession?.(interview.id)
                      }}
                      type="button"
                    >
                      Join
                    </button>
                  ) : null}
                </td>
              )}
              {props.showCancel && (
                <td className={hasBothColumns ? 'rounded-r-lg px-3 py-3' : 'px-3 py-3'}>
                  {canCancel ? (
                    <button
                      aria-label={`Cancel ${interview.id}`}
                      className="inline-flex rounded-md border border-red-400 px-2.5 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
                      onClick={function handleCancel() {
                        props.onCancelInterview?.(interview.id)
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  ) : isCancelling ? (
                    <button
                      aria-label={`Cancelling ${interview.id}`}
                      className="inline-flex cursor-not-allowed rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-400"
                      disabled
                      type="button"
                    >
                      Cancelling...
                    </button>
                  ) : null}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function formatInterviewType(value: InterviewListItem['type']): string {
  if (value === 'system_design') {
    return 'System Design'
  }

  if (value === 'coding') {
    return 'Coding'
  }

  return 'Behavioral'
}

export function formatInterviewMode(value: InterviewListItem['mode']): string {
  if (value === 'peer_to_peer') {
    return 'Peer to Peer'
  }

  return 'AI-led'
}

export function formatInterviewStatus(
  value: InterviewListItem['status'],
): string {
  if (value === 'scheduled') {
    return 'Scheduled'
  }

  if (value === 'ongoing') {
    return 'Ongoing'
  }

  if (value === 'completed') {
    return 'Completed'
  }

  return 'Cancelled'
}

export { formatScheduledTime } from '#/lib/format-scheduled-time'

