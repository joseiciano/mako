import { WorkflowEntrypoint } from "cloudflare:workers"

export default {
  async fetch(request, env) {
    const metadata = {
      service: "backend-api",
      queue: env.NOTIFICATION_QUEUE ? "configured" : "missing",
      hyperdrive: env.HYPERDRIVE ? "configured" : "missing",
      workflow: env.SESSION_TIMER_WORKFLOW ? "configured" : "missing",
    }

    return new Response(JSON.stringify(metadata, null, 2), {
      headers: {
        "content-type": "application/json",
      },
    })
  },
}

export class SessionTimerWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do("log-start", async () => {
      console.log("workflow started", JSON.stringify(event))
    })

    return {
      status: "ok",
      workflow: "session-timer",
    }
  }
}
