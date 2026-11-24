import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
  type WorkflowStepContext,
} from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { z } from 'zod'
import {
  classifyRecordingJobs,
  createAiGatewayFeedbackAnalysisAdapter,
  createArtifactStorage,
  createPostgresConnectionPool,
  createR2BucketPort,
  createWorkersAiTranscriptionAdapter,
  DEFAULT_FEEDBACK_ANALYSIS_CONFIG,
  DEFAULT_TRANSCRIPTION_CONFIG,
  FEEDBACK_PROMPT_VERSION,
  FeedbackAnalysisRepository,
  FeedbackAnalysisService,
  FeedbackWorkflowRepository,
  InterviewRepository,
  logFeedbackWorkflowEvent,
  sendWorkDue,
  TranscriptionChunkRepository,
  TranscriptionRepository,
  TranscriptionService,
  type PostgresConnectionClient,
  type R2BucketPort,
  type SqlQueryExecutor,
  type TranscriptionRunMode,
} from '@mako/shared-backend'
import type { WorkerBindings } from '../index'

export const feedbackWorkflowPayloadSchema = z
  .object({
    interview_id: z.string().uuid(),
    schema_version: z.number().int().positive(),
  })
  .strict()

export type FeedbackWorkflowPayload = z.infer<typeof feedbackWorkflowPayloadSchema>

// Stable step names. Every step.do call below is configured with bounded
// retries/backoff/timeout (Story 5.18 AC #1); a mix of retryable
// infrastructure/provider conditions (plain `Error`, retried per config) and
// non-retryable validation/eligibility conditions (`NonRetryableError`,
// failed immediately) share these steps, so the outer `resolveTerminalOutcome`
// below is what ultimately decides the safe terminal classification.
export const STEP_ELIGIBILITY_LOAD = 'feedback-eligibility-load'
export const STEP_PROCESSING_CLAIM = 'feedback-processing-claim'
export const STEP_ARTIFACT_READINESS = 'feedback-artifact-readiness'
export const STEP_SCREENSHOT_READINESS = 'feedback-screenshot-readiness'
export const STEP_HEARTBEAT_PRE_TRANSCRIPTION = 'feedback-heartbeat-pre-transcription'
export const STEP_HEARTBEAT_PRE_ANALYSIS = 'feedback-heartbeat-pre-analysis'
export const STEP_TRANSCRIPTION = 'feedback-transcription'
export const STEP_ANALYSIS = 'feedback-analysis'
export const STEP_TERMINAL_FAILURE = 'feedback-terminal-failure'
export const STEP_TERMINAL_UNAVAILABLE = 'feedback-terminal-unavailable'

const DB_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
  timeout: '15 seconds',
}

/**
 * Bounded wait for required recording/audio artifacts to finalize. Ten
 * attempts at a 20-second constant delay bounds the wait to ~3.3 minutes
 * before `assets_not_ready` is surfaced.
 */
const ARTIFACT_READINESS_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 10, delay: '20 seconds', backoff: 'constant' },
  timeout: '30 seconds',
}

/**
 * Bounded wait for whiteboard screenshot finalization. Screenshots are
 * optional evidence, so this step's failure/exhaustion is always swallowed
 * by its caller rather than failing the pipeline.
 */
const SCREENSHOT_READINESS_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 4, delay: '15 seconds', backoff: 'constant' },
  timeout: '15 seconds',
}

const TRANSCRIPTION_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
  timeout: '10 minutes',
}

/**
 * Worst-case wall-clock budget, in minutes, for `STEP_TRANSCRIPTION` to
 * either succeed or exhaust its retries: 3 attempts (1 initial + the 2
 * configured retries) each allowed to run up to the step's 10-minute
 * timeout, plus the exponential backoff delays between attempts (10s, then
 * 20s, per `TRANSCRIPTION_STEP_CONFIG`) -> 3 * 10 + (10 + 20) / 60 = 30.5.
 *
 * This is the binding constraint on the stale-processing sweep's heartbeat
 * threshold (`feedback-stale-processing-sweep.ts`): the heartbeat is
 * refreshed once, immediately before this step starts
 * (`STEP_HEARTBEAT_PRE_TRANSCRIPTION`), and is not touched again until the
 * step resolves, so the sweep must never fence an attempt that is still
 * legitimately inside this window. Exported so the sweep's threshold is
 * derived from (and stays in sync with) this step's actual retry/timeout
 * budget instead of a hand-maintained number that can silently drift.
 */
export const TRANSCRIPTION_STEP_MAX_DURATION_MINUTES = 3 * 10 + (10 + 20) / 60

/**
 * Safety margin, in minutes, added on top of the longest-running step's
 * worst-case budget (currently `STEP_TRANSCRIPTION`) before a heartbeat is
 * considered stale. Covers runtime scheduling jitter and the other, smaller
 * per-step wait/retry budgets (artifact/screenshot readiness, analysis)
 * that can still be outstanding around it.
 */
const STALE_HEARTBEAT_SAFETY_MARGIN_MINUTES = 15

/**
 * A `processing` feedback row whose heartbeat is older than this is treated
 * as a zombie attempt: the Workflow instance that owns it crashed, was
 * evicted, or otherwise stopped heartbeating without ever reaching a
 * terminal status. Derived from (and kept comfortably above)
 * `TRANSCRIPTION_STEP_MAX_DURATION_MINUTES` -- the worst-case retry/timeout
 * budget of the longest-running step this workflow runs between heartbeat
 * refreshes -- plus `STALE_HEARTBEAT_SAFETY_MARGIN_MINUTES`, so an attempt
 * that is still legitimately running its transcription step is never
 * fenced out from under itself.
 */
export const STALE_HEARTBEAT_THRESHOLD_MINUTES = Math.ceil(
  TRANSCRIPTION_STEP_MAX_DURATION_MINUTES + STALE_HEARTBEAT_SAFETY_MARGIN_MINUTES,
)

const ANALYSIS_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
  timeout: '5 minutes',
}

type FeedbackErrorCode =
  | 'assets_not_ready'
  | 'transcription_failed'
  | 'analysis_failed'
  | 'invalid_feedback'
  | 'internal_error'

const FEEDBACK_ERROR_CODES: readonly FeedbackErrorCode[] = [
  'assets_not_ready',
  'transcription_failed',
  'analysis_failed',
  'invalid_feedback',
  'internal_error',
]

type FeedbackUnavailableReason = 'no_recording' | 'unsupported_format'

/**
 * Throws a non-retryable signal, caught once by `resolveTerminalOutcome`
 * below. The classification is encoded in the plain string `message` (never
 * a custom class field) so it survives intact even if the Workflows runtime
 * ever reconstructs the error across a durability boundary.
 */
function throwUnavailableSignal(reason: FeedbackUnavailableReason): never {
  throw new NonRetryableError(`unavailable:${reason}`, 'FeedbackWorkflowSignal')
}

function throwFailureSignal(code: FeedbackErrorCode): never {
  throw new NonRetryableError(`failed:${code}`, 'FeedbackWorkflowSignal')
}

function throwStaleSignal(): never {
  throw new NonRetryableError('stale', 'FeedbackWorkflowSignal')
}

type TerminalOutcome =
  | { kind: 'stale' }
  | { kind: 'unavailable'; reason: FeedbackUnavailableReason }
  | { kind: 'failed'; errorCode: FeedbackErrorCode }

const ASSETS_NOT_READY_RETRY_MESSAGE = 'assets_not_ready_retry'
const TRANSCRIPTION_FAILED_RETRY_MESSAGE = 'transcription_failed_retry'
const ANALYSIS_RETRY_MESSAGE = 'analysis_retry'
const INVALID_FEEDBACK_RETRY_MESSAGE = 'invalid_feedback_retry'

function resolveTerminalOutcome(error: unknown): TerminalOutcome {
  const message = error instanceof Error ? error.message : String(error)

  if (message === 'stale') {
    return { kind: 'stale' }
  }

  if (message.startsWith('unavailable:')) {
    const reason = message.slice('unavailable:'.length)
    return {
      kind: 'unavailable',
      reason: reason === 'no_recording' ? 'no_recording' : 'unsupported_format',
    }
  }

  if (message.startsWith('failed:')) {
    const code = message.slice('failed:'.length)
    return {
      kind: 'failed',
      errorCode: (FEEDBACK_ERROR_CODES as readonly string[]).includes(code)
        ? (code as FeedbackErrorCode)
        : 'internal_error',
    }
  }

  if (message === ASSETS_NOT_READY_RETRY_MESSAGE) {
    return { kind: 'failed', errorCode: 'assets_not_ready' }
  }

  if (message === TRANSCRIPTION_FAILED_RETRY_MESSAGE) {
    return { kind: 'failed', errorCode: 'transcription_failed' }
  }

  if (message === ANALYSIS_RETRY_MESSAGE) {
    return { kind: 'failed', errorCode: 'analysis_failed' }
  }

  if (message === INVALID_FEEDBACK_RETRY_MESSAGE) {
    return { kind: 'failed', errorCode: 'invalid_feedback' }
  }

  return { kind: 'failed', errorCode: 'internal_error' }
}

function extractAiGatewayId(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) {
    return undefined
  }

  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const segments = trimmed.split('/')
  return segments[segments.length - 1]
}

/** Satisfies the screenshots bucket port contract when only the recordings
 * bucket is configured; `createArtifactStorage` requires a non-null
 * screenshots port even though screenshot evidence is optional. */
function noOpScreenshotBucketPort(): R2BucketPort {
  return {
    async put() {},
    async head() {
      return null
    },
    async get() {
      return null
    },
    async delete() {},
  }
}

export class InterviewFeedbackWorkflow extends WorkflowEntrypoint<
  WorkerBindings,
  FeedbackWorkflowPayload
> {
  async run(event: Readonly<WorkflowEvent<FeedbackWorkflowPayload>>, step: WorkflowStep) {
    const payload = feedbackWorkflowPayloadSchema.parse(event.payload)
    const env = this.env
    const workflowInstanceId = event.instanceId
    const { queryExecutor, cleanup } = createWorkflowQueryExecutor(env)

    try {
      logFeedbackWorkflowEvent('received', {
        interviewId: payload.interview_id,
        workflowInstanceId,
        step: STEP_ELIGIBILITY_LOAD,
        schemaVersion: payload.schema_version,
      })

      // Step 1: Load canonical interview state from Postgres
      const eligibility = await step.do(
        STEP_ELIGIBILITY_LOAD,
        DB_STEP_CONFIG,
        async function loadEligibility() {
          const repository = new InterviewRepository({ queryExecutor })

          const interview = await repository.getInterviewFeedbackState(payload.interview_id)

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

          if (interview.feedback_status === 'failed') {
            return { eligible: false, reason: 'previously_failed' }
          }

          if (interview.feedback_status === 'not_started') {
            return { eligible: false, reason: 'not_pending' }
          }

          // Only 'pending' is eligible for processing
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
        },
      )

      if (!eligibility.eligible) {
        return { status: 'skipped', reason: eligibility.reason }
      }

      const mode: TranscriptionRunMode =
        eligibility.interview.mode === 'peer_to_peer' ? 'peer_to_peer' : 'ai_led'

      // Step 2: Claim work with conditional pending -> processing update
      const workflowRepository = new FeedbackWorkflowRepository(queryExecutor)
      const claim = await step.do(STEP_PROCESSING_CLAIM, DB_STEP_CONFIG, async function claimWork() {
        const attemptId = crypto.randomUUID()
        const now = new Date().toISOString()
        const claimed = await workflowRepository.claimProcessing(payload.interview_id, attemptId, now)
        if (claimed) {
          await sendFeedbackStaleDeadline(env, payload.interview_id)
        }

        return { claimed, attempt_id: claimed ? attemptId : null }
      })

      if (!claim.claimed) {
        return { status: 'skipped', reason: 'already_claimed' }
      }

      const attemptId = claim.attempt_id as string
      const claimedAt = Date.now()
      logFeedbackWorkflowEvent('claimed', {
        interviewId: payload.interview_id,
        workflowInstanceId,
        step: STEP_PROCESSING_CLAIM,
      })

      try {
        if (!env.AI || !env.RECORDINGS_BUCKET) {
          throwFailureSignal('internal_error')
        }

        const recordingsPort = createR2BucketPort(env.RECORDINGS_BUCKET)
        const screenshotsPort = env.SCREENSHOTS_BUCKET
          ? createR2BucketPort(env.SCREENSHOTS_BUCKET)
          : noOpScreenshotBucketPort()
        const storagePort = createArtifactStorage(recordingsPort, screenshotsPort)

        const transcriptionRepository = new TranscriptionRepository(queryExecutor)
        const transcriptionChunkRepository = new TranscriptionChunkRepository(queryExecutor)
        const transcriptionAdapter = createWorkersAiTranscriptionAdapter(env.AI, DEFAULT_TRANSCRIPTION_CONFIG)
        const transcriptionService = new TranscriptionService(
          transcriptionRepository,
          transcriptionChunkRepository,
          storagePort,
          transcriptionAdapter,
          DEFAULT_TRANSCRIPTION_CONFIG,
        )

        // Step 3: Bounded wait for required recording/audio artifacts.
        const trackReadiness = await step.do(
          STEP_ARTIFACT_READINESS,
          ARTIFACT_READINESS_STEP_CONFIG,
          async function checkArtifactReadiness(ctx: WorkflowStepContext) {
            const jobs = await workflowRepository.listRecordingJobs(payload.interview_id)
            const classification = classifyRecordingJobs(jobs)

            if (classification === 'no_recording') {
              throwUnavailableSignal('no_recording')
            }
            if (classification === 'format_or_mapping_failure') {
              throwUnavailableSignal('unsupported_format')
            }
            if (classification === 'infrastructure_failure') {
              throwFailureSignal('assets_not_ready')
            }

            const readiness = await transcriptionService.checkReadiness(
              payload.interview_id,
              attemptId,
              mode,
            )

            if (readiness.outcome === 'unsupported_format') {
              throwUnavailableSignal('unsupported_format')
            }
            if (readiness.outcome === 'stale') {
              throwStaleSignal()
            }
            if (readiness.outcome === 'not_ready') {
              logFeedbackWorkflowEvent('waiting_for_assets', {
                interviewId: payload.interview_id,
                workflowInstanceId,
                step: STEP_ARTIFACT_READINESS,
                attempt: ctx.attempt,
              })
              throw new Error(ASSETS_NOT_READY_RETRY_MESSAGE)
            }

            return readiness
          },
        )

        let transcript: string

        if (trackReadiness.outcome === 'reused') {
          transcript = trackReadiness.transcript
        } else {
          // Step 3b: bounded, best-effort wait for whiteboard screenshots.
          // Screenshots are optional evidence: exhausting this wait (or the
          // interview simply having none) never fails the pipeline.
          await waitForScreenshotFinalization(step, workflowRepository, payload.interview_id)

          await refreshHeartbeatOrStale(
            step,
            STEP_HEARTBEAT_PRE_TRANSCRIPTION,
            env,
            workflowRepository,
            payload.interview_id,
            attemptId,
          )

          const transcriptionStartedAt = Date.now()
          const transcriptionOutcome = await step.do(
            STEP_TRANSCRIPTION,
            TRANSCRIPTION_STEP_CONFIG,
            async function transcribe(ctx: WorkflowStepContext) {
              if (ctx.attempt > 1) {
                logFeedbackWorkflowEvent('retrying', {
                  interviewId: payload.interview_id,
                  workflowInstanceId,
                  step: STEP_TRANSCRIPTION,
                  attempt: ctx.attempt,
                })
              }

              const result = await transcriptionService.transcribeAndPersist({
                interviewId: payload.interview_id,
                attemptId,
                tracks: trackReadiness.tracks,
              })

              if (result.outcome === 'failed') {
                // Plain (retryable) error: provider/infrastructure
                // transcription failures should exhaust
                // `TRANSCRIPTION_STEP_CONFIG`'s configured retries before
                // this step gives up, mirroring `STEP_ANALYSIS` below.
                throw new Error(TRANSCRIPTION_FAILED_RETRY_MESSAGE)
              }
              if (result.outcome === 'stale') {
                throwStaleSignal()
              }

              return result
            },
          )

          transcript = transcriptionOutcome.transcript
          logFeedbackWorkflowEvent('transcribed', {
            interviewId: payload.interview_id,
            workflowInstanceId,
            step: STEP_TRANSCRIPTION,
            durationMs: Date.now() - transcriptionStartedAt,
            transcriptChars: transcript.length,
            transcriptTruncated: transcript.length >= DEFAULT_TRANSCRIPTION_CONFIG.maxTranscriptChars,
          })
        }

        await refreshHeartbeatOrStale(
          step,
          STEP_HEARTBEAT_PRE_ANALYSIS,
          env,
          workflowRepository,
          payload.interview_id,
          attemptId,
        )

        const analysisRepository = new FeedbackAnalysisRepository(queryExecutor)
        const screenshotMetrics = await readScreenshotMetricsForTelemetry(
          analysisRepository,
          payload.interview_id,
        )

        logFeedbackWorkflowEvent('analysis_started', {
          interviewId: payload.interview_id,
          workflowInstanceId,
          step: STEP_ANALYSIS,
          promptVersion: FEEDBACK_PROMPT_VERSION,
          transcriptChars: transcript.length,
          screenshotCount: screenshotMetrics?.count,
          screenshotBytes: screenshotMetrics?.bytes,
        })

        const analysisStartedAt = Date.now()
        const analysisOutcome = await step.do(
          STEP_ANALYSIS,
          ANALYSIS_STEP_CONFIG,
          async function analyze(ctx: WorkflowStepContext) {
            if (ctx.attempt > 1) {
              logFeedbackWorkflowEvent('retrying', {
                interviewId: payload.interview_id,
                workflowInstanceId,
                step: STEP_ANALYSIS,
                attempt: ctx.attempt,
              })
            }

            const analysisAdapter = createAiGatewayFeedbackAnalysisAdapter(DEFAULT_FEEDBACK_ANALYSIS_CONFIG, {
              accountId: env.CLOUDFLARE_ACCOUNT_ID,
              apiToken: env.CLOUDFLARE_API_TOKEN,
              gatewayId: extractAiGatewayId(env.AI_GATEWAY_BASE_URL),
              apiBaseUrl: env.CLOUDFLARE_API_BASE_URL,
            })
            const analysisService = new FeedbackAnalysisService(
              analysisRepository,
              storagePort,
              analysisAdapter,
              DEFAULT_FEEDBACK_ANALYSIS_CONFIG,
            )

            const outcome = await analysisService.run({
              interviewId: payload.interview_id,
              attemptId,
            })

            if (outcome.outcome === 'invalid') {
              throw new Error(INVALID_FEEDBACK_RETRY_MESSAGE)
            }
            if (outcome.outcome === 'failed' || outcome.outcome === 'not_ready') {
              throw new Error(ANALYSIS_RETRY_MESSAGE)
            }
            if (outcome.outcome === 'stale') {
              throwStaleSignal()
            }

            return outcome
          },
        )

        logFeedbackWorkflowEvent('ready', {
          interviewId: payload.interview_id,
          workflowInstanceId,
          step: STEP_ANALYSIS,
          durationMs: Date.now() - analysisStartedAt,
          promptVersion: FEEDBACK_PROMPT_VERSION,
          schemaVersion: analysisOutcome.feedback.schema_version,
        })

        return { status: 'ready', interview_id: payload.interview_id, attempt_id: attemptId }
      } catch (error) {
        const resolved = resolveTerminalOutcome(error)

        if (resolved.kind === 'stale') {
          return { status: 'skipped', interview_id: payload.interview_id, reason: 'stale' }
        }

        if (resolved.kind === 'unavailable') {
          await step.do(STEP_TERMINAL_UNAVAILABLE, DB_STEP_CONFIG, async function markUnavailable() {
            await workflowRepository.markUnavailable(payload.interview_id, attemptId, resolved.reason)
          })
          logFeedbackWorkflowEvent('unavailable', {
            interviewId: payload.interview_id,
            workflowInstanceId,
            step: STEP_TERMINAL_UNAVAILABLE,
            durationMs: Date.now() - claimedAt,
            unavailableReason: resolved.reason,
          })

          return {
            status: 'not_started',
            interview_id: payload.interview_id,
            unavailable_reason: resolved.reason,
          }
        }

        await step.do(STEP_TERMINAL_FAILURE, DB_STEP_CONFIG, async function markFailed() {
          await workflowRepository.markFailed(payload.interview_id, attemptId, resolved.errorCode)
        })
        logFeedbackWorkflowEvent('failed', {
          interviewId: payload.interview_id,
          workflowInstanceId,
          step: STEP_TERMINAL_FAILURE,
          durationMs: Date.now() - claimedAt,
          errorCode: resolved.errorCode,
        })

        return { status: 'failed', interview_id: payload.interview_id, error_code: resolved.errorCode }
      }
    } finally {
      await cleanup()
    }
  }
}

/**
 * Best-effort aggregate screenshot count/byte telemetry for the
 * `analysis_started` event (Story 5.18: "aggregate transcript/image size
 * ... without content"). Never object keys or image bytes themselves, and
 * never allowed to fail the pipeline — a read error here just omits the
 * metrics from that one log line.
 */
async function readScreenshotMetricsForTelemetry(
  analysisRepository: FeedbackAnalysisRepository,
  interviewId: string,
): Promise<{ count: number; bytes: number } | undefined> {
  try {
    const screenshots = await analysisRepository.listFinalizedScreenshots(interviewId)
    return {
      count: screenshots.length,
      bytes: screenshots.reduce((sum, screenshot) => sum + (screenshot.content_size_bytes ?? 0), 0),
    }
  } catch {
    return undefined
  }
}

/**
 * Bounded, best-effort wait for whiteboard screenshot finalization.
 * Screenshots are optional evidence (Story 5.17): exhausting the wait (or
 * the step itself erroring) always resolves to "continue without them"
 * rather than propagating a failure into the pipeline.
 */
async function waitForScreenshotFinalization(
  step: WorkflowStep,
  workflowRepository: FeedbackWorkflowRepository,
  interviewId: string,
): Promise<void> {
  try {
    await step.do(STEP_SCREENSHOT_READINESS, SCREENSHOT_READINESS_STEP_CONFIG, async function checkScreenshots() {
      const state = await workflowRepository.getScreenshotFinalizationState(interviewId)

      if (!state?.screenshots_finalized_at) {
        throw new Error('screenshots_not_finalized')
      }
    })
  } catch {
    // Intentionally swallowed: see function doc comment above.
  }
}

/**
 * Refreshes the processing heartbeat before a long-running transcription or
 * analysis step so the stale-processing sweep never fences a still-active
 * attempt. Throws the `stale` signal when another attempt already owns the
 * row, which stops this run before it does any further (wasted) work.
 */
async function refreshHeartbeatOrStale(
  step: WorkflowStep,
  stepName: string,
  env: WorkerBindings,
  workflowRepository: FeedbackWorkflowRepository,
  interviewId: string,
  attemptId: string,
): Promise<void> {
  await step.do(stepName, DB_STEP_CONFIG, async function refreshHeartbeat() {
    const refreshed = await workflowRepository.refreshHeartbeat(interviewId, attemptId)

    if (!refreshed) {
      throwStaleSignal()
    }

    await sendFeedbackStaleDeadline(env, interviewId)
  })
}

/**
 * Sends the delayed message that retries stale processing at heartbeat time
 * plus the stale threshold. A refreshed heartbeat sends a new message; the
 * older one arrives early and is re-sent by the consumer. Never throws: the
 * hourly sweep recovers a lost message.
 */
async function sendFeedbackStaleDeadline(env: WorkerBindings, interviewId: string): Promise<void> {
  const nowMs = Date.now()
  await sendWorkDue(
    {
      async send(message, options) {
        await env.NOTIFICATION_QUEUE.send(
          message,
          options ? { delaySeconds: options.delaySeconds } : undefined,
        )
      },
    },
    {
      error(event, context) {
        console.error({ event, component: 'FeedbackWorkflow', ...context })
      },
    },
    {
      duty: 'feedback_stale',
      entityId: interviewId,
      dueAtMs: nowMs + STALE_HEARTBEAT_THRESHOLD_MINUTES * 60_000,
      nowMs,
    },
  )
}

function createWorkflowQueryExecutor(env: WorkerBindings): {
  queryExecutor: SqlQueryExecutor
  cleanup: () => Promise<void>
} {
  const connectionString = env.HYPERDRIVE?.connectionString
  if (!connectionString) {
    throw new Error('HYPERDRIVE binding is not configured')
  }

  const pool = createPostgresConnectionPool(connectionString)
  let clientPromise: Promise<PostgresConnectionClient> | null = null

  return {
    queryExecutor: {
      async query<Row>(queryInput: { text: string; values: readonly unknown[] }) {
        if (!clientPromise) {
          clientPromise = pool.connect()
        }
        const client = await clientPromise
        const result = await client.query(queryInput.text, [...queryInput.values])
        return {
          rows: result.rows as Row[],
          rowCount: result.rowCount ?? undefined,
        }
      },
    },
    async cleanup() {
      if (clientPromise) {
        const client = await clientPromise
        await client.release()
      }
    },
  }
}
