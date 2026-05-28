import { createFileRoute } from '@tanstack/react-router'
import { Schedule } from './interviews/schedule/schedule-smart'

export const Route = createFileRoute('/_authenticated/interviews/new')({
  component: Schedule,
})
