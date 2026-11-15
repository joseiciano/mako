import { createFileRoute } from '@tanstack/react-router'
import { InterviewerApplicationSmart } from '../components/settings/interviewer-application'

export const Route = createFileRoute('/_authenticated/settings/interviewer-application')({
  component: InterviewerApplicationSmart,
})
