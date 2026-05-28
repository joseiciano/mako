export function formatScheduledTime(isoTime: string): string {
  const scheduledTime = new Date(isoTime)

  if (Number.isNaN(scheduledTime.valueOf())) {
    return 'Unknown scheduled time'
  }

  return scheduledTime.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
