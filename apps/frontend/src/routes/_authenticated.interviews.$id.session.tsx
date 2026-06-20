import { createFileRoute } from '@tanstack/react-router'
import { SessionSmart } from './interviews/session/session-smart'

export const Route = createFileRoute('/_authenticated/interviews/$id/session')({
  component: SessionRoute,
})

function SessionRoute() {
  const { id } = Route.useParams()
  return <SessionSmart interviewId={id} />
}
