import { interviewFeedbackV1Schema, type InterviewFeedbackV1 } from '@mako/shared'
import type { ArtifactStoragePort } from '../interview-assets'
import { buildFeedbackEvidenceContext } from './feedback-context'
import { buildFeedbackMessages, FEEDBACK_PROMPT_VERSION } from './feedback-prompt'
import type { FeedbackAnalysisConfig } from './feedback-analysis-config'
import { FeedbackAnalysisRepository } from './feedback-analysis-repository'
import type { FeedbackAnalysisAdapterPort } from './feedback-analysis-adapter'

export type FeedbackAnalysisOutcome =
  | { outcome: 'reused'; feedback: InterviewFeedbackV1 }
  | { outcome: 'stale' }
  | { outcome: 'not_ready' }
  | { outcome: 'persisted'; feedback: InterviewFeedbackV1 }
  | { outcome: 'invalid'; error_code: 'invalid_feedback' }
  | { outcome: 'failed'; error_code: 'analysis_failed' }

/**
 * Orchestrates Story 5.17: builds the bounded, deterministic evidence
 * context, sends it to the pinned vision-capable model through Cloudflare AI
 * Gateway, strictly validates the parsed response against
 * `interviewFeedbackV1Schema` regardless of provider guarantees, and
 * persists exactly one validated report with an attempt-fenced conditional
 * `processing -> ready` write. Malformed, partial, unsupported-version,
 * out-of-range, or unknown-key responses are rejected without ever writing
 * `interviews.feedback`.
 */
export class FeedbackAnalysisService {
  constructor(
    private readonly repository: FeedbackAnalysisRepository,
    private readonly storagePort: ArtifactStoragePort,
    private readonly adapter: FeedbackAnalysisAdapterPort,
    private readonly config: FeedbackAnalysisConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(input: { interviewId: string; attemptId: string }): Promise<FeedbackAnalysisOutcome> {
    const state = await this.repository.getAnalysisState(input.interviewId)

    if (!state) {
      return { outcome: 'stale' }
    }

    if (state.feedback_status === 'ready') {
      return reuseExistingFeedback(state.feedback)
    }

    if (state.feedback_status !== 'processing' || state.feedback_attempt_id !== input.attemptId) {
      return { outcome: 'stale' }
    }

    if (state.transcript === null) {
      return { outcome: 'not_ready' }
    }

    const screenshotRows = await this.repository.listFinalizedScreenshots(input.interviewId)
    const context = await buildFeedbackEvidenceContext({
      metadata: {
        interviewType: state.type,
        interviewMode: state.mode,
        interviewTier: state.tier,
        candidateAlias: state.scheduler_alias,
      },
      transcript: state.transcript,
      screenshotRows,
      storagePort: this.storagePort,
      config: this.config,
    })

    const messages = buildFeedbackMessages({
      metadata: context.metadata,
      transcript: context.transcript,
      transcriptTruncated: context.metrics.transcriptTruncated,
      screenshots: context.screenshots,
    })

    let rawContent: string
    try {
      const result = await this.adapter.analyze(messages)
      rawContent = result.content
    } catch {
      return { outcome: 'failed', error_code: 'analysis_failed' }
    }

    const parsedJson = safeParseJson(rawContent)
    if (parsedJson === undefined) {
      return { outcome: 'invalid', error_code: 'invalid_feedback' }
    }

    const validated = interviewFeedbackV1Schema.safeParse(parsedJson)
    if (!validated.success) {
      return { outcome: 'invalid', error_code: 'invalid_feedback' }
    }

    const persisted = await this.repository.persistReadyFeedback({
      interviewId: input.interviewId,
      attemptId: input.attemptId,
      feedback: validated.data,
      promptVersion: FEEDBACK_PROMPT_VERSION,
      generatedAt: this.now().toISOString(),
    })

    if (persisted) {
      return { outcome: 'persisted', feedback: validated.data }
    }

    // Lost the race: re-read so freshly computed work is reused rather than
    // silently discarded if another process already persisted a report, and
    // never overwrite an already-ready report on a duplicate automatic retry.
    const latest = await this.repository.getAnalysisState(input.interviewId)
    if (latest && latest.feedback_status === 'ready') {
      return reuseExistingFeedback(latest.feedback)
    }

    return { outcome: 'stale' }
  }
}

function reuseExistingFeedback(feedback: unknown): FeedbackAnalysisOutcome {
  const parsed = interviewFeedbackV1Schema.safeParse(feedback)
  return parsed.success ? { outcome: 'reused', feedback: parsed.data } : { outcome: 'stale' }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(stripJsonCodeFence(text))
  } catch {
    return undefined
  }
}

/**
 * Defensively strips a markdown code fence if the model ignored the
 * "no markdown" instruction. The result is still parsed and validated
 * strictly regardless of what remains.
 */
function stripJsonCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenceMatch ? fenceMatch[1] : trimmed
}
