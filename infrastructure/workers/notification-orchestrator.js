import { WorkflowEntrypoint } from "cloudflare:workers"

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = typeof message.body === "string" ? message.body : JSON.stringify(message.body)
      console.log("notification-orchestrator bootstrap defers message", body)
      message.retry()
    }
  },
}

export class InterviewFeedbackWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do("log-start", async () => {
      console.log("workflow started", JSON.stringify(event))
    })

    return {
      status: "ok",
      workflow: "feedback",
    }
  }
}

export class RecordingFinalizationWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do("log-start", async () => {
      console.log("workflow started", JSON.stringify(event))
    })

    return {
      status: "ok",
      workflow: "recording-finalization",
    }
  }
}
