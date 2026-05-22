export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = typeof message.body === "string" ? message.body : JSON.stringify(message.body)
      console.log("notification-orchestrator message", body)
      message.ack()
    }

    if (env.REALTIME_APP_ID) {
      console.log("realtime binding configured")
    }
  },
}

export class InterviewLifecycleWorkflow {
  async run(event, step) {
    await step.do("log-start", async () => {
      console.log("workflow started", JSON.stringify(event))
    })

    return {
      status: "ok",
      workflow: "interview-lifecycle",
    }
  }
}
