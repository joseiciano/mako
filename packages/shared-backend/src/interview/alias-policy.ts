import { z } from 'zod'

export const interviewModeSchema = z.enum(['peer_to_peer', 'ai_led'])

export type InterviewMode = z.infer<typeof interviewModeSchema>

export type InterviewAliases = {
  schedulerAlias: string
  interviewerAlias: string
}

const schedulerAliasByMode: Record<InterviewMode, string> = {
  peer_to_peer: 'Candidate-Blue',
  ai_led: 'Candidate-Blue',
}

const interviewerAliasByMode: Record<InterviewMode, string> = {
  peer_to_peer: 'Interviewer-Red',
  ai_led: 'Interviewer-Red',
}

export function buildInterviewAliases(modeInput: unknown): InterviewAliases {
  const mode = interviewModeSchema.parse(modeInput)

  return {
    schedulerAlias: schedulerAliasByMode[mode],
    interviewerAlias: interviewerAliasByMode[mode],
  }
}
