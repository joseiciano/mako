import { createFileRoute } from '@tanstack/react-router'
import { FeedbackSmart } from './interviews/feedback/feedback-smart'

export const Route = createFileRoute('/_authenticated/interviews/$id/feedback')({
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { id } = Route.useParams()
  return <FeedbackSmart interviewId={id} />
}
