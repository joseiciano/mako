import type { AccountProfile, InterviewListItem } from '@mako/shared'

export type DashboardState = 'loading' | 'error' | 'empty' | 'populated'

export type DashboardDumbProps = {
  state: DashboardState
  account?: AccountProfile
  upcomingInterviews?: InterviewListItem[]
  errorMessage?: string
}

export function DashboardDumb(props: DashboardDumbProps) {
  const content = renderDashboardContent(props)

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
      {content}
    </section>
  )
}

function renderDashboardContent(props: DashboardDumbProps) {
  if (props.state === 'loading') {
    return <p className="mt-3 text-slate-300">Loading dashboard data...</p>
  }

  if (props.state === 'error') {
    return (
      <p className="mt-3 text-red-300" role="alert">
        {props.errorMessage ?? 'Unable to load dashboard.'}
      </p>
    )
  }

  if (props.state === 'empty') {
    return (
      <div className="mt-3 space-y-2 text-slate-300">
        <p>Welcome back, {props.account?.displayName}.</p>
        <p>No upcoming interviews scheduled.</p>
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2 text-slate-300">
      <p>Welcome back, {props.account?.displayName}.</p>
      <p>You have {props.upcomingInterviews?.length ?? 0} upcoming interviews.</p>
    </div>
  )
}
