import type { AccountProfile, InterviewListItem } from '@mako/shared'

export type DashboardState = 'loading' | 'error' | 'empty' | 'populated'

export type DashboardDumbProps = {
  state: DashboardState
  account?: AccountProfile
  upcomingInterviews?: InterviewListItem[]
  errorMessage?: string
  isInterviewDetailsRouteAvailable?: boolean
}

export function DashboardDumb(props: DashboardDumbProps) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-300">
          Track your available interview balances and upcoming sessions.
        </p>
      </header>

      {renderDashboardContent(props)}
    </main>
  )
}

function renderDashboardContent(props: DashboardDumbProps) {
  if (props.state === 'loading') {
    return (
      <p
        aria-live="polite"
        className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-slate-300"
        role="status"
      >
        Loading dashboard data...
      </p>
    )
  }

  if (props.state === 'error') {
    return (
      <section className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200">
        <p role="alert">{props.errorMessage ?? 'Unable to load dashboard.'}</p>
      </section>
    )
  }

  const account = props.account
  const upcomingInterviews = props.upcomingInterviews ?? []

  if (!account) {
    return (
      <section className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200">
        <p role="alert">Unable to load dashboard.</p>
      </section>
    )
  }

  if (props.state === 'empty' || upcomingInterviews.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <QuickStatsCards account={account} />

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Upcoming interviews</h2>
          <p className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            No upcoming interviews scheduled.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <QuickStatsCards account={account} />

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Upcoming interviews</h2>
        <p className="mt-1 text-sm text-slate-300">
          You have {upcomingInterviews.length} upcoming interviews.
        </p>

        <div className="mt-4 overflow-x-auto">
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
                <th className="px-3 py-1" scope="col">
                  Details
                </th>
              </tr>
            </thead>

            <tbody>
              {upcomingInterviews.map(function mapInterview(interview) {
                const counterpartAlias = selectCounterpartAlias(account.id, interview)

                return (
                  <tr
                    className="rounded-lg border border-slate-800 bg-slate-950/70 text-sm text-slate-200"
                    key={interview.id}
                  >
                    <td className="rounded-l-lg px-3 py-3">{formatInterviewType(interview.type)}</td>
                    <td className="px-3 py-3">{formatInterviewMode(interview.mode)}</td>
                    <td className="px-3 py-3">{formatInterviewStatus(interview.status)}</td>
                    <td className="px-3 py-3">
                      <time dateTime={interview.scheduled_at}>
                        {formatScheduledTime(interview.scheduled_at)}
                      </time>
                    </td>
                    <td className="px-3 py-3">{counterpartAlias}</td>
                    <td className="rounded-r-lg px-3 py-3">
                      {props.isInterviewDetailsRouteAvailable ? (
                        <a
                          className="inline-flex rounded-md border border-emerald-400 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                          href={`/interviews/${interview.id}`}
                        >
                          View details
                        </a>
                      ) : (
                        <button
                          aria-disabled="true"
                          className="inline-flex cursor-not-allowed rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-400"
                          disabled
                          type="button"
                        >
                          Details coming soon
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function QuickStatsCards(props: { account: AccountProfile }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold text-white">Quick stats</h2>
      <p className="mt-1 text-sm text-slate-300">Welcome back, {props.account.displayName}.</p>

      <dl className="mt-4 grid gap-3">
        <QuickStatCard label="Credits" value={props.account.credits} />
        <QuickStatCard
          label="Free Standard Interviews"
          value={props.account.freeStandardInterviews}
        />
        <QuickStatCard label="Free AI Interviews" value={props.account.freeAiInterviews} />
      </dl>
    </section>
  )
}

function QuickStatCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{props.label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-emerald-300">{props.value}</dd>
    </div>
  )
}

export function selectCounterpartAlias(
  viewerUserId: string,
  interview: Pick<InterviewListItem, 'scheduler_id' | 'scheduler_alias' | 'interviewer_alias'>,
): string {
  if (viewerUserId === interview.scheduler_id) {
    return interview.interviewer_alias
  }

  return interview.scheduler_alias
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

export function formatInterviewStatus(value: InterviewListItem['status']): string {
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

export function formatScheduledTime(isoTime: string): string {
  const scheduledTime = new Date(isoTime)

  if (Number.isNaN(scheduledTime.valueOf())) {
    return 'Unknown scheduled time'
  }

  return scheduledTime.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}
