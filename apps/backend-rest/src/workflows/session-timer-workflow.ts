import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import {
  InterviewRepository,
  buildInterviewCompletedEvent,
  NotificationRepository,
  NotificationService,
} from '@mako/shared-backend'
import type { TimerStartParams } from '@mako/shared-backend'
import type { WorkerBindings } from '../index'
import { createDatabaseQueryExecutor } from '../database'

type TimerWarningLog = {
  event: 'timer_warning'
  interview_id: string
  warning_at: string
  expires_at: string
  source: 'workflow'
}

type TimerCompletedLog = {
  event: 'timer_completed'
  interview_id: string
  expires_at: string
  outcome: string
  reason: string
  source: 'workflow'
}

export function buildTimerWarningLog(params: {
  interview_id: string
  warning_at: string
  expires_at: string
}): TimerWarningLog {
  return {
    event: 'timer_warning',
    interview_id: params.interview_id,
    warning_at: params.warning_at,
    expires_at: params.expires_at,
    source: 'workflow',
  }
}

export function buildTimerCompletedLog(params: {
  interview_id: string
  expires_at: string
  outcome: string
  reason: string
}): TimerCompletedLog {
  return {
    event: 'timer_completed',
    interview_id: params.interview_id,
    expires_at: params.expires_at,
    outcome: params.outcome,
    reason: params.reason,
    source: 'workflow',
  }
}

export class SessionTimerWorkflow extends WorkflowEntrypoint<
  WorkerBindings,
  TimerStartParams
> {
  async run(event: Readonly<WorkflowEvent<TimerStartParams>>, step: WorkflowStep) {
    const params = event.payload
    const env = this.env

    await step.sleepUntil('wait_for_warning', new Date(params.warning_at))

    await step.do('emit_warning', async function emitWarning() {
      console.info(buildTimerWarningLog({
        interview_id: params.interview_id,
        warning_at: params.warning_at,
        expires_at: params.expires_at,
      }))

      return { warning_emitted: true }
    })

    await step.sleepUntil('wait_for_expiration', new Date(params.expires_at))

    await step.do('complete_interview', async function completeInterview() {
      const queryExecutor = createDatabaseQueryExecutor(env)
      const notificationRepository = new NotificationRepository({ queryExecutor })
      const notificationService = new NotificationService(notificationRepository)
      const repository = new InterviewRepository({
        queryExecutor,
        persistOutboxEvent: async function persistOutboxEvent(event) {
          await notificationService.persistOutboxEvent(
            event as Parameters<NotificationService['persistOutboxEvent']>[0],
          )
        },
      })

      const interview = await repository.getInterviewById(params.interview_id)

      if (!interview) {
        console.info(buildTimerCompletedLog({
          interview_id: params.interview_id,
          expires_at: params.expires_at,
          outcome: 'not_found',
          reason: 'interview not found',
        }))
        return { completed: false, reason: 'not_found' }
      }

      const outboxEvent = buildInterviewCompletedEvent({
        interview: { ...interview, status: 'completed' },
      })

      const transitionResult = await repository.transitionInterviewLifecycle({
        interview_id: params.interview_id,
        participant_user_id: interview.scheduler_id,
        action: 'end',
        updated_at: new Date().toISOString(),
        started_at_precondition: params.started_at,
      }, outboxEvent)

      if (
        transitionResult.outcome === 'completed' ||
        transitionResult.outcome === 'already_completed'
      ) {
        console.info(buildTimerCompletedLog({
          interview_id: params.interview_id,
          expires_at: params.expires_at,
          outcome: transitionResult.outcome,
          reason: 'timer_expired',
        }))
        return { completed: true, reason: transitionResult.outcome }
      }

      console.info(buildTimerCompletedLog({
        interview_id: params.interview_id,
        expires_at: params.expires_at,
        outcome: transitionResult.outcome,
        reason: `skipped: ${transitionResult.outcome}`,
      }))
      return { completed: false, reason: transitionResult.outcome }
    })
  }
}
