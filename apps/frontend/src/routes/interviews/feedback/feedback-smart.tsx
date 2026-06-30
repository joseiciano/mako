import { useNavigate } from '@tanstack/react-router'
import { useInterviewDetail } from '#/hooks/use-interviews'
import { FeedbackDumb } from './feedback-dumb'

type FeedbackSmartProps = {
  interviewId: string
}

const LOAD_FEEDBACK_ERROR_MESSAGE = 'Unable to load feedback. Please try again.'

export function FeedbackSmart({ interviewId }: FeedbackSmartProps) {
  const navigate = useNavigate()
  const interviewQuery = useInterviewDetail(interviewId)

  function handleBack() {
    navigate({ to: '/interviews/$id', params: { id: interviewId } })
  }

  return (
    <FeedbackDumb
      errorMessage={interviewQuery.isError ? LOAD_FEEDBACK_ERROR_MESSAGE : null}
      interview={interviewQuery.data ?? null}
      isLoading={interviewQuery.isPending}
      onBack={handleBack}
    />
  )
}
