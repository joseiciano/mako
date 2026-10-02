import { useNavigate } from '@tanstack/react-router'
import { useFeedbackReport } from '#/hooks/use-feedback-report'
import { createApiUrl } from '#/lib/http-transport'
import { FeedbackDumb } from './feedback-dumb'

type FeedbackSmartProps = {
  interviewId: string
}

export function FeedbackSmart({ interviewId }: FeedbackSmartProps) {
  const navigate = useNavigate()
  const report = useFeedbackReport(interviewId)

  function handleBack() {
    navigate({ to: '/interviews/$id', params: { id: interviewId } })
  }

  function handleSignIn() {
    navigate({ to: '/login' })
  }

  const recordingUrl = report.interview?.recording_url
    ? createApiUrl(report.interview.recording_url)
    : null
  const screenshotUrls = (report.interview?.screenshot_urls ?? []).map(createApiUrl)

  return (
    <FeedbackDumb
      errorKind={report.errorKind}
      hasReachedPollingDeadline={report.hasReachedPollingDeadline}
      interview={report.interview}
      isLoading={report.isLoading}
      isPolling={report.isPolling}
      onBack={handleBack}
      onRefresh={report.refresh}
      onSignIn={handleSignIn}
      recordingUrl={recordingUrl}
      screenshotUrls={screenshotUrls}
    />
  )
}
