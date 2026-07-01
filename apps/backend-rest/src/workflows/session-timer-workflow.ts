import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import { InterviewRepository } from '@mako/shared-backend'
import type { TimerStartParams } from '@mako/shared-backend'
import type { WorkerBindings } from '../index'
import { createDatabaseQueryExecutor } from '../database'

export class SessionTimerWorkflow extends WorkflowEntrypoint<
  WorkerBindings,
  TimerStartParams
> {
  async run(event: Readonly<WorkflowEvent<TimerStartParams>>, step: WorkflowStep) {
    const params = event.payload
    const env = this.env

    await step.sleepUntil('wait_for_warning', new Date(params.warning_at))

    await step.do('emit_warning', async function emitWarning() {
      console.info('[SessionTimerWorkflow] 5-minute warning emitted', {
        interview_id: params.interview_id,
        warning_at: params.warning_at,
      })

      return { warning_emitted: true }
    })

    await step.sleepUntil('wait_for_expiration', new Date(params.expires_at))

    await step.do('complete_interview', async function completeInterview() {
      const queryExecutor = createDatabaseQueryExecutor(env)
      const repository = new InterviewRepository({ queryExecutor })

      const interview = await repository.getInterviewById(params.interview_id)

      if (!interview) {
        return { completed: false, reason: 'not_found' }
      }

      if (interview.status === 'completed') {
        return { completed: true, reason: 'already_completed' }
      }

      await repository.transitionInterviewLifecycle({
        interview_id: params.interview_id,
        participant_user_id: interview.scheduler_id,
        action: 'end',
        updated_at: new Date().toISOString(),
      })

      return { completed: true, reason: 'timer_expired' }
    })
  }
}
