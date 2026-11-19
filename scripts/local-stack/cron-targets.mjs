export const cronPathPrefix = '/__local/cron/'

export const cronTargets = [
  { name: 'orchestrator', intervalMs: 5 * 60 * 1000 },
  { name: 'matcher', intervalMs: 10 * 60 * 1000 },
]

export const cronBindings = {
  orchestrator: { binding: 'LOCAL_CRON_ORCHESTRATOR', service: 'mako-notification-orchestrator' },
  matcher: { binding: 'LOCAL_CRON_MATCHER', service: 'mako-greedy-matcher' },
}

export function cronPathFor(name) {
  return `${cronPathPrefix}${name}`
}
