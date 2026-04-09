import { useAccount } from '#/hooks/use-account'
import { useScheduledInterviews } from '#/hooks/use-scheduled-interviews'
import { DashboardDumb } from './dashboard-dumb'

export function DashboardSmart() {
  const accountQuery = useAccount()
  const scheduledInterviewsQuery = useScheduledInterviews()

  if (accountQuery.isPending || scheduledInterviewsQuery.isPending) {
    return <DashboardDumb state="loading" />
  }

  if (accountQuery.isError) {
    return <DashboardDumb state="error" errorMessage={accountQuery.error.message} />
  }

  if (scheduledInterviewsQuery.isError) {
    return (
      <DashboardDumb
        state="error"
        errorMessage={scheduledInterviewsQuery.error.message}
      />
    )
  }

  const account = accountQuery.data
  const upcomingInterviews = scheduledInterviewsQuery.data

  if (!account || !upcomingInterviews) {
    return <DashboardDumb state="error" errorMessage="Unable to load dashboard." />
  }

  if (upcomingInterviews.length === 0) {
    return <DashboardDumb state="empty" account={account} />
  }

  return (
    <DashboardDumb
      state="populated"
      account={account}
      upcomingInterviews={upcomingInterviews}
    />
  )
}
