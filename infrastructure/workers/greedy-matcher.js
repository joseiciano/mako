export default {
  async scheduled(controller, env) {
    const payload = {
      source: "greedy-matcher",
      timestamp: new Date().toISOString(),
      reason: "cron tick",
    }

    await env.INTERVIEW_PROVISIONING_QUEUE.send(payload)
  },
}
