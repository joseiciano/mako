import app, { SessionTimerWorkflow } from '../../apps/backend-rest/src/index.ts'

const cronPathPattern = /^\/__local\/cron\/(orchestrator|matcher)$/
const cronBindingNames = {
  orchestrator: 'LOCAL_CRON_ORCHESTRATOR',
  matcher: 'LOCAL_CRON_MATCHER',
}

export { SessionTimerWorkflow }

export default {
  async fetch(request, env, ctx) {
    const match = cronPathPattern.exec(new URL(request.url).pathname)

    if (!match) {
      return app.fetch(request, env, ctx)
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const binding = env[cronBindingNames[match[1]]]

    await binding.scheduled({ scheduledTime: Date.now(), cron: '' })

    return Response.json({ triggered: match[1] })
  },
}
