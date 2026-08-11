import { createFileRoute } from '@tanstack/react-router'
import { InterviewerAvailability } from '../components/settings/interviewer-availability'

export const Route = createFileRoute('/_authenticated/settings/interviewer-availability')({
  component: InterviewerAvailability,
})
