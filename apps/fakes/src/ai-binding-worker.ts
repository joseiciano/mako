import { WorkerEntrypoint } from 'cloudflare:workers'
import { fakeAiRun } from './ai-run.ts'

/** Stands in for the `AI` binding when local fakes are on; bound as a service entrypoint. */
export class FakeAi extends WorkerEntrypoint {
  async run(model: string, _input?: unknown): Promise<Record<string, unknown>> {
    return fakeAiRun(model)
  }
}

export default {
  fetch(): Response {
    return new Response('fake workers ai binding')
  },
}
