import { createFileRoute } from '@tanstack/react-router'
import { InterviewsSmart } from './interviews/interviews-smart'

export const Route = createFileRoute('/_authenticated/interviews')({
  component: InterviewsSmart,
})
