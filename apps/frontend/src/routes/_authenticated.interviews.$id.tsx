import { createFileRoute } from '@tanstack/react-router'
import { DetailsSmart } from './interviews/details/details-smart'

export const Route = createFileRoute('/_authenticated/interviews/$id')({
  component: DetailsRoute,
})

function DetailsRoute() {
  const { id } = Route.useParams()
  return <DetailsSmart interviewId={id} />
}
