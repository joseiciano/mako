import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import { z } from 'zod'
import {
  createPostgresConnectionPool,
  createSqlQuery,
  InterviewRepository,
  type SqlQueryExecutor,
} from '@mako/shared-backend'
import type { WorkerBindings } from '../index'

export const feedbackWorkflowPayloadSchema = z
  .object({
    interview_id: z.string().uuid(),
    schema_version: z.number().int().positive(),
  })
  .strict()

export type FeedbackWorkflowPayload = z.infer<typeof feedbackWorkflowPayloadSchema>

// Stable step names
export const STEP_ELIGIBILITY_LOAD = 'feedback-eligibility-load'
export const STEP_PROCESSING_CLAIM = 'feedback-processing-claim'
export const STEP_ARTIFACT_READINESS = 'feedback-artifact-readiness'
export const STEP_TRANSCRIPTION = 'feedback-transcription'
export const STEP_ANALYSIS = 'feedback-analysis'
export const STEP_PERSISTENCE = 'feedback-persistence'
export const STEP_TERMINAL_FAILURE = 'feedback-terminal-failure'

export class InterviewFeedbackWorkflow extends WorkflowEntrypoint<
  WorkerBindings,
  FeedbackWorkflowPayload
> {
  async run(event: Readonly<WorkflowEvent<FeedbackWorkflowPayload>>, step: WorkflowStep) {
    const payload = feedbackWorkflowPayloadSchema.parse(event.payload)
    const env = this.env

    // Step 1: Load canonical interview state from Postgres
    const eligibility = await step.do(STEP_ELIGIBILITY_LOAD, async function loadEligibility() {
      const queryExecutor = createWorkflowQueryExecutor(env)
      const repository = new InterviewRepository({ queryExecutor })

      const interview = await repository.getInterviewById(payload.interview_id)

      if (!interview) {
        return { eligible: false, reason: 'not_found' }
      }

      // Check if feedback is already ready, processing, or ineligible
      if (interview.feedback_status === 'ready') {
        return { eligible: false, reason: 'already_ready' }
      }

      if (interview.feedback_status === 'processing') {
        return { eligible: false, reason: 'already_processing' }
      }

      if (interview.feedback_status === 'not_started' && interview.feedback_unavailable_reason) {
        return { eligible: false, reason: 'ineligible' }
      }

      return {
        eligible: true,
        interview: {
          id: interview.id,
          status: interview.status,
          recording_status: interview.recording_status,
          feedback_status: interview.feedback_status,
          screenshots_finalized_at: interview.screenshots_finalized_at,
          type: interview.type,
          mode: interview.mode,
          tier: interview.tier,
          scheduler_alias: interview.scheduler_alias,
        },
      }
    })

    if (!eligibility.eligible) {
      return { status: 'skipped', reason: eligibility.reason }
    }

    // Step 2: Claim work with conditional pending -> processing update
    const claim = await step.do(STEP_PROCESSING_CLAIM, async function claimWork() {
      const queryExecutor = createWorkflowQueryExecutor(env)

      const attemptId = crypto.randomUUID()
      const now = new Date().toISOString()

      const result = await queryExecutor.query<{ id: string }>(
        createSqlQuery(
          `
            UPDATE interviews
            SET feedback_status = 'processing',
                feedback_attempt_id = $2,
                feedback_processing_started_at = $3,
                feedback_processing_heartbeat_at = $3,
                feedback_unavailable_reason = NULL,
                feedback_error_code = NULL
            WHERE id = $1
              AND feedback_status = 'pending'
            RETURNING id;
          `,
          [payload.interview_id, attemptId, now],
        ),
      )

      const claimed = result.rowCount !== undefined ? result.rowCount > 0 : result.rows.length > 0

      return { claimed, attempt_id: claimed ? attemptId : null }
    })

    if (!claim.claimed) {
      return { status: 'skipped', reason: 'already_claimed' }
    }

    // Steps 3-6 are stubs for future stories (5.16, 5.17)
    // The workflow shell provides stable orchestration boundaries

    await step.do(STEP_ARTIFACT_READINESS, async function artifactReadiness() {
      // Future: wait for recording finalization webhook
      // For now, just log
      console.log('[feedback-workflow] artifact_readiness_step', {
        interview_id: payload.interview_id,
        attempt_id: claim.attempt_id,
      })
      return { artifacts_ready: false, reason: 'awaiting_implementation' }
    })

    // Return early - future steps will be implemented in 5.16/5.17
    return {
      status: 'processing',
      interview_id: payload.interview_id,
      attempt_id: claim.attempt_id,
      next_step: 'artifact_readiness',
    }
  }
}

function createWorkflowQueryExecutor(env: WorkerBindings): SqlQueryExecutor {
  const connectionString = env.HYPERDRIVE?.connectionString
  if (!connectionString) {
    throw new Error('HYPERDRIVE binding is not configured')
  }

  const pool = createPostgresConnectionPool(connectionString)

  return {
    async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
      const client = await pool.connect()
      try {
        const result = await client.query(queryInput.text, [...queryInput.values])
        return {
          rows: result.rows as Row[],
          rowCount: result.rowCount ?? undefined,
        }
      } finally {
        await client.release()
      }
    },
  }
}
