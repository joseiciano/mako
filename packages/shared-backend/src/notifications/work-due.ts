import { remainingDelaySeconds } from './delayed-send'
import {
  workDueTransportMessageSchema,
  type NotificationTransport,
  type WorkDueDuty,
  type WorkDueTransportMessage,
} from './notification-transport-message'

export type WorkDueLogger = {
  error(event: string, context: Record<string, unknown>): void | Promise<void>
}

export type SendWorkDueInput = {
  duty: WorkDueDuty
  entityId: string
  dueAtMs: number
  nowMs: number
}

export type CloseOverdueOutcome =
  | { outcome: 'resolved' }
  | { outcome: 'closed' }
  | { outcome: 'failed' }
  | { outcome: 'early'; dueAtMs: number }

export type WorkDueDependencies = {
  recordingStop: {
    closeOverdueRecordingsForInterview(input: {
      interviewId: string
      maxAgeSeconds: number
    }): Promise<CloseOverdueOutcome>
  }
  recordingStart: {
    ensureRecordingStarted(interviewId: string): Promise<string>
  }
  transport: Pick<NotificationTransport, 'send'> | undefined
  logger: WorkDueLogger
  now: () => number
  maxAgeSeconds: number
}

/** Sends one delayed work.due message and throws on failure (consumer re-sends, so the queue retries). */
export async function sendWorkDueOrThrow(
  transport: Pick<NotificationTransport, 'send'> | undefined,
  input: SendWorkDueInput,
): Promise<void> {
  if (!transport) return
  const message: WorkDueTransportMessage = {
    message_type: 'work.due',
    idempotency_key: `${input.duty}:${input.entityId}:${input.dueAtMs}`,
    duty: input.duty,
    entity_id: input.entityId,
    due_at: new Date(input.dueAtMs).toISOString(),
  }
  await transport.send(message, {
    delaySeconds: remainingDelaySeconds(input.dueAtMs, input.nowMs),
  })
}

/** Creation-site send. Never throws; the hourly sweep recovers a lost message. */
export async function sendWorkDue(
  transport: Pick<NotificationTransport, 'send'> | undefined,
  logger: WorkDueLogger,
  input: SendWorkDueInput,
): Promise<void> {
  try {
    await sendWorkDueOrThrow(transport, input)
  } catch (error) {
    try {
      await logger.error('work_due_send_failed', {
        duty: input.duty,
        entity_id: input.entityId,
        error_name: error instanceof Error ? error.name : 'unknown',
      })
    } catch {
      // Logging must never fail the caller.
    }
  }
}

/** Re-checks database state, acts on open work, and re-sends early arrivals. */
export async function processWorkDue(
  message: WorkDueTransportMessage,
  deps: WorkDueDependencies,
): Promise<void> {
  const parsed = workDueTransportMessageSchema.parse(message)
  const nowMs = deps.now()

  if (parsed.duty === 'recording_overdue') {
    const result = await deps.recordingStop.closeOverdueRecordingsForInterview({
      interviewId: parsed.entity_id,
      maxAgeSeconds: deps.maxAgeSeconds,
    })
    if (result.outcome === 'failed') throw new Error('recording_overdue_stop_failed')
    if (result.outcome === 'early') {
      await sendWorkDueOrThrow(deps.transport, {
        duty: parsed.duty,
        entityId: parsed.entity_id,
        dueAtMs: result.dueAtMs,
        nowMs,
      })
    }
    return
  }

  const dueAtMs = Date.parse(parsed.due_at)
  const outcome = await deps.recordingStart.ensureRecordingStarted(parsed.entity_id)
  if (outcome === 'in_progress' && nowMs < dueAtMs) {
    await sendWorkDueOrThrow(deps.transport, {
      duty: parsed.duty,
      entityId: parsed.entity_id,
      dueAtMs,
      nowMs,
    })
  }
}
