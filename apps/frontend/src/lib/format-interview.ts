import type { InterviewDetail, InterviewListItem } from '@mako/shared'

export function formatInterviewType(
  value: InterviewDetail['type'] | InterviewListItem['type'],
): string {
  if (value === 'system_design') return 'System Design'
  if (value === 'coding') return 'Coding'
  return 'Behavioral'
}

export function formatInterviewMode(
  value: InterviewDetail['mode'] | InterviewListItem['mode'],
): string {
  if (value === 'peer_to_peer') return 'Peer to Peer'
  return 'AI-led'
}

export function formatInterviewStatus(
  value: InterviewDetail['status'] | InterviewListItem['status'],
): string {
  if (value === 'scheduled') return 'Scheduled'
  if (value === 'ongoing') return 'Ongoing'
  if (value === 'completed') return 'Completed'
  return 'Cancelled'
}