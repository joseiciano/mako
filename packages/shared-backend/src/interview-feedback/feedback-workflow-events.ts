/**
 * Privacy-safe structured telemetry for Story 5.18. `logFeedbackWorkflowEvent`
 * only ever serializes an explicit allowlist of safe fields (IDs, versions,
 * step names, counters, durations, safe codes) onto the log line. There is no
 * free-form "message"/"details" passthrough field, so a caller physically
 * cannot route transcript text, feedback prose, candidate aliases, object
 * keys, signed URLs, or provider credentials/payloads into a log line through
 * this function.
 */
export type FeedbackWorkflowEventName =
  | 'received'
  | 'claimed'
  | 'waiting_for_assets'
  | 'transcribed'
  | 'analysis_started'
  | 'ready'
  | 'retrying'
  | 'failed'
  | 'unavailable'
  | 'skipped'

export type FeedbackWorkflowLogContext = {
  interviewId: string
  workflowInstanceId: string
  step: string
  promptVersion?: string
  schemaVersion?: number
  attempt?: number
  durationMs?: number
  errorCode?: string
  unavailableReason?: string
  reason?: string
  /** Aggregate transcript length, never the transcript text itself. */
  transcriptChars?: number
  transcriptTruncated?: boolean
  /** Aggregate screenshot count/size, never object keys or image bytes. */
  screenshotCount?: number
  screenshotBytes?: number
}

export function logFeedbackWorkflowEvent(
  event: FeedbackWorkflowEventName,
  context: Readonly<FeedbackWorkflowLogContext>,
  consoleLike: Pick<Console, 'info'> = console,
): void {
  const safeFields: Record<string, unknown> = {
    event: `feedback_workflow.${event}`,
    source: 'feedback-workflow',
    interview_id: context.interviewId,
    workflow_instance_id: context.workflowInstanceId,
    step: context.step,
  }

  if (context.promptVersion !== undefined) safeFields.prompt_version = context.promptVersion
  if (context.schemaVersion !== undefined) safeFields.schema_version = context.schemaVersion
  if (context.attempt !== undefined) safeFields.attempt = context.attempt
  if (context.durationMs !== undefined) safeFields.duration_ms = context.durationMs
  if (context.errorCode !== undefined) safeFields.error_code = context.errorCode
  if (context.unavailableReason !== undefined) safeFields.unavailable_reason = context.unavailableReason
  if (context.reason !== undefined) safeFields.reason = context.reason
  if (context.transcriptChars !== undefined) safeFields.transcript_chars = context.transcriptChars
  if (context.transcriptTruncated !== undefined) safeFields.transcript_truncated = context.transcriptTruncated
  if (context.screenshotCount !== undefined) safeFields.screenshot_count = context.screenshotCount
  if (context.screenshotBytes !== undefined) safeFields.screenshot_bytes = context.screenshotBytes

  consoleLike.info(safeFields)
}
