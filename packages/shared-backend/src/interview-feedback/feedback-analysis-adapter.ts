import { buildCloudflareApiUrl } from '../cloudflare-api-url'
import type { FeedbackAnalysisConfig } from './feedback-analysis-config'
import type { FeedbackPromptMessage } from './feedback-prompt'

/** Required Cloudflare account/gateway credentials are not configured. */
export class FeedbackAnalysisUnavailableError extends Error {
  constructor(message = 'Feedback analysis AI Gateway is not configured.') {
    super(message)
    this.name = 'FeedbackAnalysisUnavailableError'
  }
}

/** The provider was unreachable, timed out, returned a retryable status, or exhausted bounded retries. */
export class FeedbackAnalysisProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'FeedbackAnalysisProviderError'
  }
}

/** The provider responded with a non-retryable (client/auth) error status. */
export class FeedbackAnalysisTerminalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedbackAnalysisTerminalError'
  }
}

/** The provider responded, but the response envelope could not be parsed. Never retried: the provider already answered. */
export class FeedbackAnalysisInvalidResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedbackAnalysisInvalidResponseError'
  }
}

export type FeedbackAnalysisAdapterResult = {
  content: string
}

export type FeedbackAnalysisAdapterPort = {
  analyze(messages: readonly FeedbackPromptMessage[]): Promise<FeedbackAnalysisAdapterResult>
}

export type FeedbackAnalysisAdapterOptions = {
  accountId?: string
  apiToken?: string
  gatewayId?: string
  apiBaseUrl?: string
  fetch?: typeof fetch
}

/**
 * Wraps Cloudflare AI Gateway's OpenAI-compatible chat-completions endpoint
 * for post-interview feedback analysis (Story 5.17), using the same
 * Cloudflare REST endpoint + `cf-aig-gateway-id` header pattern as the
 * AI-led chat responder (Story 4.3). Feedback analysis always requires a
 * configured gateway (unlike AI chat's direct-call fallback), since
 * observability/routing for this cost-bearing, high-reasoning request is
 * mandatory. Requests structured JSON output where supported, bounds
 * retries to transport/5xx/429 failures, and never retries a response the
 * provider already returned — the final feedback payload is still parsed
 * and strictly validated by the caller regardless of what the provider
 * claims to guarantee.
 */
export function createAiGatewayFeedbackAnalysisAdapter(
  config: FeedbackAnalysisConfig,
  options: FeedbackAnalysisAdapterOptions,
): FeedbackAnalysisAdapterPort {
  const { accountId, apiToken, gatewayId } = options
  const fetchImpl = options.fetch ?? globalThis.fetch

  return {
    async analyze(messages): Promise<FeedbackAnalysisAdapterResult> {
      if (!accountId || !apiToken || !gatewayId) {
        throw new FeedbackAnalysisUnavailableError()
      }

      const endpoint = buildCloudflareApiUrl(
        options.apiBaseUrl,
        `/accounts/${accountId}/ai/v1/chat/completions`,
      )
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'cf-aig-gateway-id': gatewayId,
        'cf-aig-skip-cache': 'true',
        'cf-aig-request-timeout': String(config.timeoutMs),
      }
      const body = JSON.stringify({
        model: config.model,
        messages,
        max_tokens: config.maxOutputTokens,
        response_format: { type: 'json_object' },
      })

      let lastRetryableError: unknown

      for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
        let response: Response
        try {
          response = await runWithTimeout(
            fetchImpl(endpoint, { method: 'POST', headers, body }),
            config.timeoutMs,
          )
        } catch (error) {
          lastRetryableError = error
          continue
        }

        if (!response.ok) {
          if (!isRetryableStatus(response.status)) {
            throw new FeedbackAnalysisTerminalError(
              `AI Gateway returned a non-retryable error (${response.status}).`,
            )
          }
          lastRetryableError = new Error(
            `AI Gateway returned a retryable error (${response.status}).`,
          )
          continue
        }

        const json: unknown = await response.json().catch(() => undefined)
        return extractContent(json)
      }

      throw new FeedbackAnalysisProviderError(
        'AI Gateway feedback analysis failed after bounded retries.',
        { cause: lastRetryableError },
      )
    },
  }
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429
}

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>(function executor(resolve, reject) {
    const timer = setTimeout(function onTimeout() {
      reject(new FeedbackAnalysisProviderError('AI Gateway feedback analysis timed out.'))
    }, timeoutMs)

    promise.then(
      function onResolve(value) {
        clearTimeout(timer)
        resolve(value)
      },
      function onReject(error: unknown) {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function extractContent(json: unknown): FeedbackAnalysisAdapterResult {
  if (!isRecord(json)) {
    throw new FeedbackAnalysisInvalidResponseError(
      'AI Gateway feedback analysis returned an unparseable response.',
    )
  }

  const result = isRecord(json.result) ? json.result : json
  const choices = result.choices

  if (!Array.isArray(choices) || choices.length === 0) {
    throw new FeedbackAnalysisInvalidResponseError(
      'AI Gateway feedback analysis response had no choices.',
    )
  }

  const firstChoice = choices[0]
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new FeedbackAnalysisInvalidResponseError(
      'AI Gateway feedback analysis response had no message.',
    )
  }

  const content = firstChoice.message.content
  if (typeof content !== 'string' || content.trim() === '') {
    throw new FeedbackAnalysisInvalidResponseError(
      'AI Gateway feedback analysis returned empty content.',
    )
  }

  return { content }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
