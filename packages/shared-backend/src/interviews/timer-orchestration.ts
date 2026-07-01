export type TimerStartParams = {
  interview_id: string
  started_at: string
  expires_at: string
  warning_at: string
}

export type TimerOrchestrationPort = {
  startTimer(params: TimerStartParams): Promise<void>
}

export type TimerWorkflowBinding = {
  create(options: { id: string, params: TimerStartParams }): Promise<unknown>
}

export function createInMemoryTimerOrchestration(): TimerOrchestrationPort & {
  calls: TimerStartParams[]
} {
  const calls: TimerStartParams[] = []
  const instanceIds = new Set<string>()

  return {
    calls,
    async startTimer(params: TimerStartParams): Promise<void> {
      if (instanceIds.has(params.interview_id)) {
        return
      }

      instanceIds.add(params.interview_id)
      calls.push(params)
    },
  }
}

export function createWorkflowTimerOrchestration(
  binding: TimerWorkflowBinding,
): TimerOrchestrationPort {
  return {
    async startTimer(params: TimerStartParams): Promise<void> {
      try {
        await binding.create({
          id: params.interview_id,
          params,
        })
      } catch (error) {
        if (isWorkflowInstanceAlreadyExistsError(error)) {
          return
        }

        throw error
      }
    },
  }
}

function isWorkflowInstanceAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'WorkflowInstanceAlreadyExistsError'
  )
}
