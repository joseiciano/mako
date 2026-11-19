import { describe, expect, it } from 'vitest'
import {
  createAiGatewayFeedbackAnalysisAdapter,
  FeedbackAnalysisInvalidResponseError,
  FeedbackAnalysisProviderError,
  FeedbackAnalysisTerminalError,
  FeedbackAnalysisUnavailableError,
} from './feedback-analysis-adapter'
import { DEFAULT_FEEDBACK_ANALYSIS_CONFIG, type FeedbackAnalysisConfig } from './feedback-analysis-config'
import type { FeedbackPromptMessage } from './feedback-prompt'

const config: FeedbackAnalysisConfig = { ...DEFAULT_FEEDBACK_ANALYSIS_CONFIG, maxRetries: 2, timeoutMs: 5_000 }

const messages: FeedbackPromptMessage[] = [
  { role: 'system', content: 'system prompt' },
  { role: 'user', content: [{ type: 'text', text: 'evidence' }] },
]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createAiGatewayFeedbackAnalysisAdapter', function suite() {
  it('throws FeedbackAnalysisUnavailableError when credentials are not configured', async function run() {
    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      fetch: (async () => jsonResponse(200, {})) as typeof fetch,
    })

    await expect(adapter.analyze(messages)).rejects.toBeInstanceOf(FeedbackAnalysisUnavailableError)
  })

  it('posts to the Cloudflare REST chat/completions endpoint with the gateway header and pinned model', async function run() {
    let lastUrl = ''
    let lastInit: RequestInit = {}
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      lastUrl = String(input)
      lastInit = init ?? {}
      return jsonResponse(200, { result: { choices: [{ message: { content: '{"ok":true}' } }] } })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    const result = await adapter.analyze(messages)

    expect(result.content).toBe('{"ok":true}')
    expect(lastUrl).toBe('https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/chat/completions')
    expect(lastInit.headers).toEqual(
      expect.objectContaining({
        'cf-aig-gateway-id': 'gw-1',
        'cf-aig-skip-cache': 'true',
        Authorization: 'Bearer tok-1',
      }),
    )
    const sentBody = JSON.parse(lastInit.body as string) as Record<string, unknown>
    expect(sentBody.model).toBe(config.model)
    expect(sentBody.messages).toEqual(messages)
    expect(sentBody.response_format).toEqual({ type: 'json_object' })
  })

  it('parses content from the top-level choices shape as well', async function run() {
    const fetchImpl = (async () =>
      jsonResponse(200, { choices: [{ message: { content: 'plain content' } }] })) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    const result = await adapter.analyze(messages)
    expect(result.content).toBe('plain content')
  })

  it('throws FeedbackAnalysisInvalidResponseError on a malformed envelope without retrying', async function run() {
    let callCount = 0
    const fetchImpl = (async () => {
      callCount += 1
      return jsonResponse(200, { unexpected: true })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    await expect(adapter.analyze(messages)).rejects.toBeInstanceOf(FeedbackAnalysisInvalidResponseError)
    expect(callCount).toBe(1)
  })

  it('throws FeedbackAnalysisInvalidResponseError when content is empty without retrying', async function run() {
    let callCount = 0
    const fetchImpl = (async () => {
      callCount += 1
      return jsonResponse(200, { result: { choices: [{ message: { content: '   ' } }] } })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    await expect(adapter.analyze(messages)).rejects.toBeInstanceOf(FeedbackAnalysisInvalidResponseError)
    expect(callCount).toBe(1)
  })

  it('throws FeedbackAnalysisTerminalError on a non-retryable 4xx status without retrying', async function run() {
    let callCount = 0
    const fetchImpl = (async () => {
      callCount += 1
      return jsonResponse(401, { error: 'unauthorized' })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    await expect(adapter.analyze(messages)).rejects.toBeInstanceOf(FeedbackAnalysisTerminalError)
    expect(callCount).toBe(1)
  })

  it('retries a retryable 500 status up to the bounded retry count, then throws FeedbackAnalysisProviderError', async function run() {
    let callCount = 0
    const fetchImpl = (async () => {
      callCount += 1
      return jsonResponse(500, { error: 'upstream' })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    await expect(adapter.analyze(messages)).rejects.toBeInstanceOf(FeedbackAnalysisProviderError)
    expect(callCount).toBe(config.maxRetries + 1)
  })

  it('retries a 429 status as retryable', async function run() {
    let callCount = 0
    const fetchImpl = (async () => {
      callCount += 1
      return jsonResponse(429, { error: 'rate limited' })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    await expect(adapter.analyze(messages)).rejects.toBeInstanceOf(FeedbackAnalysisProviderError)
    expect(callCount).toBe(config.maxRetries + 1)
  })

  it('succeeds after a transient retryable failure within the bounded retry count', async function run() {
    let callCount = 0
    const fetchImpl = (async () => {
      callCount += 1
      if (callCount === 1) {
        return jsonResponse(503, { error: 'unavailable' })
      }
      return jsonResponse(200, { result: { choices: [{ message: { content: 'recovered' } }] } })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    const result = await adapter.analyze(messages)
    expect(result.content).toBe('recovered')
    expect(callCount).toBe(2)
  })

  it('retries on a network-level throw and eventually throws FeedbackAnalysisProviderError', async function run() {
    let callCount = 0
    const fetchImpl = (async () => {
      callCount += 1
      throw new Error('network down')
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    await expect(adapter.analyze(messages)).rejects.toBeInstanceOf(FeedbackAnalysisProviderError)
    expect(callCount).toBe(config.maxRetries + 1)
  })

  it('treats a timeout as retryable and eventually throws FeedbackAnalysisProviderError', async function run() {
    const slowConfig: FeedbackAnalysisConfig = { ...config, timeoutMs: 10, maxRetries: 1 }
    let callCount = 0
    const fetchImpl = (() => {
      callCount += 1
      return new Promise<Response>(() => {
        // Never resolves within the timeout window.
      })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(slowConfig, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    await expect(adapter.analyze(messages)).rejects.toBeInstanceOf(FeedbackAnalysisProviderError)
    expect(callCount).toBe(slowConfig.maxRetries + 1)
  })
})

describe('createAiGatewayFeedbackAnalysisAdapter apiBaseUrl', function apiBaseUrlSuite() {
  it('posts to the override base', async function run() {
    let lastUrl = ''
    const fetchImpl = (async (input: RequestInfo | URL) => {
      lastUrl = String(input)
      return jsonResponse(200, { result: { choices: [{ message: { content: '{"ok":true}' } }] } })
    }) as typeof fetch

    const adapter = createAiGatewayFeedbackAnalysisAdapter(config, {
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      apiBaseUrl: 'http://fakes:9000/client/v4/',
      fetch: fetchImpl,
    })
    await adapter.analyze(messages)

    expect(lastUrl).toBe('http://fakes:9000/client/v4/accounts/acct-1/ai/v1/chat/completions')
  })

  it('throws at construction for an invalid override base', function run() {
    expect(() =>
      createAiGatewayFeedbackAnalysisAdapter(config, {
        accountId: 'acct-1',
        apiToken: 'tok-1',
        gatewayId: 'gw-1',
        apiBaseUrl: 'nope',
      }),
    ).toThrow('CLOUDFLARE_API_BASE_URL')
  })
})
