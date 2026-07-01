import { useNavigate } from '@tanstack/react-router'
import { useInterviewDetail } from '#/hooks/use-interviews'
import { DetailsDumb } from './details-dumb'

type DetailsSmartProps = {
  interviewId: string
}

const LOAD_INTERVIEW_ERROR_MESSAGE = 'Unable to load interview details. Please try again.'

export function DetailsSmart({ interviewId }: DetailsSmartProps) {
  const navigate = useNavigate()
  const interviewQuery = useInterviewDetail(interviewId)
  const interview = interviewQuery.data ?? null

  function handleBack() {
    navigate({ to: '/interviews' })
  }

  function handleJoin() {
    navigate({ to: '/interviews/$id/session', params: { id: interviewId } })
  }

  function handleViewFeedback() {
    navigate({ to: '/interviews/$id/feedback', params: { id: interviewId } })
  }

  const canJoin = interview?.status === 'scheduled' || interview?.status === 'ongoing'
  const canViewFeedback = interview?.status === 'completed'

  return (
    <DetailsDumb
      canJoin={canJoin}
      canViewFeedback={canViewFeedback}
      errorMessage={interviewQuery.isError ? LOAD_INTERVIEW_ERROR_MESSAGE : null}
      interview={interview}
      isLoading={interviewQuery.isPending}
      onBack={handleBack}
      onJoin={handleJoin}
      onViewFeedback={handleViewFeedback}
    />
  )
}
