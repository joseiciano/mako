import { describe, expect, it, vi } from 'vitest'
import { logFeedbackWorkflowEvent, type FeedbackWorkflowLogContext } from './feedback-workflow-events'

const baseContext: FeedbackWorkflowLogContext = {
  interviewId: '11111111-1111-4111-8111-111111111111',
  workflowInstanceId: 'feedback-v1-11111111-1111-4111-8111-111111111111',
  step: 'feedback-analysis',
}

describe('logFeedbackWorkflowEvent', function suite() {
  it('logs the event name, source, and allowlisted identifying fields', function run() {
    const info = vi.fn()

    logFeedbackWorkflowEvent('ready', { ...baseContext, attempt: 1, durationMs: 1200 }, { info })

    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith({
      event: 'feedback_workflow.ready',
      source: 'feedback-workflow',
      interview_id: baseContext.interviewId,
      workflow_instance_id: baseContext.workflowInstanceId,
      step: baseContext.step,
      attempt: 1,
      duration_ms: 1200,
    })
  })

  it('includes prompt/schema version, safe error code, and reason when provided', function run() {
    const info = vi.fn()

    logFeedbackWorkflowEvent(
      'failed',
      {
        ...baseContext,
        promptVersion: 'feedback-v1',
        schemaVersion: 1,
        errorCode: 'analysis_failed',
        reason: 'exhausted_retries',
      },
      { info },
    )

    const [[loggedPayload]] = info.mock.calls as [[Record<string, unknown>]]
    expect(loggedPayload.prompt_version).toBe('feedback-v1')
    expect(loggedPayload.schema_version).toBe(1)
    expect(loggedPayload.error_code).toBe('analysis_failed')
    expect(loggedPayload.reason).toBe('exhausted_retries')
  })

  it('includes only aggregate transcript/screenshot metrics, never content', function run() {
    const info = vi.fn()

    logFeedbackWorkflowEvent(
      'transcribed',
      { ...baseContext, transcriptChars: 42000, transcriptTruncated: true, screenshotCount: 3, screenshotBytes: 900_000 },
      { info },
    )

    const [[loggedPayload]] = info.mock.calls as [[Record<string, unknown>]]
    expect(loggedPayload.transcript_chars).toBe(42000)
    expect(loggedPayload.transcript_truncated).toBe(true)
    expect(loggedPayload.screenshot_count).toBe(3)
    expect(loggedPayload.screenshot_bytes).toBe(900_000)
  })

  it('never logs transcript text, feedback prose, object keys, signed URLs, or credentials even when a caller bypasses types', function run() {
    const info = vi.fn()
    const poisoned = {
      ...baseContext,
      // Simulates a caller bypassing TypeScript (e.g. via `as any`) to try to
      // smuggle sensitive sentinel values through the logger.
      transcript: 'CANDIDATE_SECRET_TRANSCRIPT_TEXT',
      feedback: 'CONFIDENTIAL_FEEDBACK_PROSE',
      candidateAlias: 'alias-leak-sentinel',
      objectKey: 'interviews/leak-interview/recording/leak-object',
      signedUrl: 'https://r2.example.com/signed?token=LEAKED_TOKEN',
      providerApiToken: 'sk-LEAKED_PROVIDER_CREDENTIAL',
      rawProviderPayload: { choices: [{ message: { content: 'raw provider body' } }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    logFeedbackWorkflowEvent('ready', poisoned, { info })

    const [[loggedPayload]] = info.mock.calls as [[Record<string, unknown>]]
    const serialized = JSON.stringify(loggedPayload)

    expect(serialized).not.toContain('CANDIDATE_SECRET_TRANSCRIPT_TEXT')
    expect(serialized).not.toContain('CONFIDENTIAL_FEEDBACK_PROSE')
    expect(serialized).not.toContain('alias-leak-sentinel')
    expect(serialized).not.toContain('leak-object')
    expect(serialized).not.toContain('LEAKED_TOKEN')
    expect(serialized).not.toContain('LEAKED_PROVIDER_CREDENTIAL')
    expect(serialized).not.toContain('raw provider body')
    expect(loggedPayload).not.toHaveProperty('transcript')
    expect(loggedPayload).not.toHaveProperty('feedback')
    expect(loggedPayload).not.toHaveProperty('candidateAlias')
    expect(loggedPayload).not.toHaveProperty('objectKey')
    expect(loggedPayload).not.toHaveProperty('signedUrl')
    expect(loggedPayload).not.toHaveProperty('providerApiToken')
    expect(loggedPayload).not.toHaveProperty('rawProviderPayload')
  })

  it('defaults to the global console when no logger is injected', function run() {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    logFeedbackWorkflowEvent('claimed', baseContext)

    expect(infoSpy).toHaveBeenCalledTimes(1)
    infoSpy.mockRestore()
  })
})
