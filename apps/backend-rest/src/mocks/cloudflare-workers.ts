export class WorkflowEntrypoint<Env = unknown, T = unknown> {
  protected ctx: unknown
  protected env: Env

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx
    this.env = env
  }

  async run(_event: unknown, _step: unknown): Promise<unknown> {
    return undefined
  }
}

export type WorkflowEvent<T> = {
  payload: Readonly<T>
  timestamp: Date
  instanceId: string
  workflowName: string
}

export type WorkflowStep = {
  do(name: string, callback: () => Promise<unknown>): Promise<unknown>
  sleep(label: string, duration: string | number): Promise<void>
  sleepUntil(label: string, timestamp: Date): Promise<void>
}
