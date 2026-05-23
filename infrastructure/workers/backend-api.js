export default {
  async fetch(request, env) {
    const metadata = {
      service: "backend-api",
      queue: env.NOTIFICATION_QUEUE ? "configured" : "missing",
      hyperdrive: env.HYPERDRIVE ? "configured" : "missing",
      workflow: env.INTERVIEW_WORKFLOW ? "configured" : "missing",
    }

    return new Response(JSON.stringify(metadata, null, 2), {
      headers: {
        "content-type": "application/json",
      },
    })
  },
}
