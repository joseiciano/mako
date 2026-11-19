import { describe, expect, it } from 'vitest'
import { AiChatUnavailableError } from './ai-chat-repository'
import {
  AI_CHAT_PROMPT_VERSION,
  AiChatProviderError,
  createAiGatewayResponder,
} from './ai-gateway-responder'
import type { AiChatServiceInput } from './types'

const BASE_INPUT: AiChatServiceInput = {
  interview_id: '33333333-3333-4333-8333-333333333333',
  session: { userId: '22222222-2222-4222-8222-222222222222', email: 'jane@example.com' },
  message: 'What should I refactor next?',
  interview_type: 'system_design',
  canvas_snapshot: {
    type: 'excalidraw_scene',
    scene: { elements: [{ type: 'rectangle' }] },
  },
  guidance_mode: 'review',
}

function createFetchStub(
  status: number,
  body: unknown,
): { fetchImpl: typeof fetch; lastRequest: { url: string; init: RequestInit } } {
  let lastRequest: { url: string; init: RequestInit } = { url: '', init: {} }
  const fetchImpl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    lastRequest.url = String(input)
    lastRequest.init = init ?? {}
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { fetchImpl, lastRequest }
}

describe('createAiGatewayResponder', function aiGatewayResponderSuite() {
  it('posts to the direct Workers AI run endpoint with messages only and no cf-aig headers when no gateway id is provided', async function run() {
    const { fetchImpl, lastRequest } = createFetchStub(200, {
      result: { response: 'Consider splitting the service layer.' },
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    const result = await responder.generateReply(BASE_INPUT)

    expect(result.reply).toBe('Consider splitting the service layer.')
    expect(lastRequest.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    )

    const sentBody = JSON.parse(lastRequest.init.body as string) as Record<string, unknown>
    expect(sentBody).not.toHaveProperty('model')
    expect(Array.isArray(sentBody.messages)).toBe(true)
    expect(lastRequest.init.headers).toEqual(
      expect.not.objectContaining({
        'cf-aig-gateway-id': expect.any(String),
        'cf-aig-skip-cache': expect.any(String),
        'cf-aig-request-timeout': expect.any(String),
      }),
    )
  })

  it('parses the direct Workers AI response from result.response when no gateway id is provided', async function run() {
    const { fetchImpl } = createFetchStub(200, {
      result: { response: 'Direct workers reply.' },
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    const result = await responder.generateReply(BASE_INPUT)
    expect(result.reply).toBe('Direct workers reply.')
  })

  it('posts to the Cloudflare REST chat/completions endpoint with model and gateway header when gateway id is provided', async function run() {
    const { fetchImpl, lastRequest } = createFetchStub(200, {
      result: {
        choices: [{ message: { role: 'assistant', content: 'Add a cache layer.' } }],
      },
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    const result = await responder.generateReply(BASE_INPUT)

    expect(result.reply).toBe('Add a cache layer.')
    expect(lastRequest.url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/chat/completions',
    )
    const sentBody = JSON.parse(lastRequest.init.body as string) as Record<string, unknown>
    expect(sentBody).toHaveProperty('model')
    expect(Array.isArray(sentBody.messages)).toBe(true)
    expect(lastRequest.init.headers).toEqual(
      expect.objectContaining({
        'cf-aig-gateway-id': 'gw-1',
        'cf-aig-skip-cache': 'true',
        'cf-aig-request-timeout': '30000',
      }),
    )
  })

  it('parses the gateway response from choices content when gateway id is provided', async function run() {
    const { fetchImpl } = createFetchStub(200, {
      result: {
        choices: [{ message: { role: 'assistant', content: 'Gateway reply.' } }],
      },
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    const result = await responder.generateReply(BASE_INPUT)
    expect(result.reply).toBe('Gateway reply.')
  })

  it('sends bounded history, the current message, and the excalidraw scene in the prompt', async function run() {
    const { fetchImpl, lastRequest } = createFetchStub(200, {
      result: { response: 'reply' },
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    await responder.generateReply({
      ...BASE_INPUT,
      chat_history: [
        { role: 'user', content: 'Here is my design.' },
        { role: 'assistant', content: 'Consider a cache layer.' },
      ],
    })

    const sentBody = JSON.parse(lastRequest.init.body as string) as {
      messages: { role: string; content: string }[]
    }
    const roles = sentBody.messages.map(function roleOf(message) {
      return message.role
    })

    expect(roles).toEqual(['system', 'user', 'assistant', 'user'])
    expect(sentBody.messages[0].content).toContain(AI_CHAT_PROMPT_VERSION)
    expect(sentBody.messages[0].content).toContain('excalidraw_scene')
    expect(sentBody.messages[0].content).toContain('rectangle')
    expect(sentBody.messages[1]).toEqual({ role: 'user', content: 'Here is my design.' })
    expect(sentBody.messages[2]).toEqual({ role: 'assistant', content: 'Consider a cache layer.' })
    expect(sentBody.messages[3]).toEqual({
      role: 'user',
      content: 'What should I refactor next?',
    })
  })

  it('sends the current message without history when chat history is absent', async function run() {
    const { fetchImpl, lastRequest } = createFetchStub(200, {
      result: { response: 'reply' },
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    await responder.generateReply(BASE_INPUT)

    const sentBody = JSON.parse(lastRequest.init.body as string) as {
      messages: { role: string; content: string }[]
    }
    expect(sentBody.messages.map(function roleOf(message) { return message.role })).toEqual([
      'system',
      'user',
    ])
    expect(sentBody.messages[1]).toEqual({
      role: 'user',
      content: 'What should I refactor next?',
    })
  })

  it('sends cache-bypass headers and an authorization bearer token on the gateway branch', async function run() {
    const { fetchImpl, lastRequest } = createFetchStub(200, {
      choices: [{ message: { role: 'assistant', content: 'reply' } }],
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      fetch: fetchImpl,
    })

    await responder.generateReply(BASE_INPUT)

    expect(lastRequest.init.method).toBe('POST')
    expect(lastRequest.init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer tok-1',
        'Content-Type': 'application/json',
        'cf-aig-gateway-id': 'gw-1',
        'cf-aig-skip-cache': 'true',
        'cf-aig-request-timeout': '30000',
      }),
    )
  })

  it('sends no cf-aig-* headers on the direct Workers AI branch', async function run() {
    const { fetchImpl, lastRequest } = createFetchStub(200, {
      result: { response: 'reply' },
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    await responder.generateReply(BASE_INPUT)

    expect(lastRequest.init.method).toBe('POST')
    expect(lastRequest.init.headers).toEqual(
      expect.not.objectContaining({
        'cf-aig-gateway-id': expect.any(String),
        'cf-aig-skip-cache': expect.any(String),
        'cf-aig-request-timeout': expect.any(String),
      }),
    )
    expect(lastRequest.init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer tok-1',
        'Content-Type': 'application/json',
      }),
    )
  })

  it('returns the prompt version on the response', async function run() {
    const { fetchImpl } = createFetchStub(200, {
      result: { response: 'reply' },
    })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    const result = await responder.generateReply(BASE_INPUT)
    expect(result.prompt_version).toBe(AI_CHAT_PROMPT_VERSION)
    expect(result.guidance_mode).toBe('review')
  })

  it('throws AiChatProviderError when the upstream returns a non-OK status', async function run() {
    const { fetchImpl } = createFetchStub(429, { error: 'rate limited' })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    await expect(responder.generateReply(BASE_INPUT)).rejects.toBeInstanceOf(
      AiChatProviderError,
    )
  })

  it('does not echo raw upstream response content in the provider error message', async function run() {
    const sensitiveUpstreamBody = {
      errors: [{ message: 'credential leaked: secret-token-123' }],
    }
    const { fetchImpl } = createFetchStub(500, sensitiveUpstreamBody)

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    const error = await responder.generateReply(BASE_INPUT).catch((caught) => caught)

    expect(error).toBeInstanceOf(AiChatProviderError)
    expect(String((error as Error).message)).not.toContain('secret-token-123')
    expect(String((error as Error).message)).not.toContain('credential leaked')
    expect(String((error as Error).message)).toBe(
      'AI provider returned an error (500).',
    )
  })

  it('throws AiChatProviderError when the response is malformed JSON', async function run() {
    const fetchImpl: typeof fetch = (async () =>
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    await expect(responder.generateReply(BASE_INPUT)).rejects.toBeInstanceOf(
      AiChatProviderError,
    )
  })

  it('throws AiChatProviderError when the reply is empty', async function run() {
    const { fetchImpl } = createFetchStub(200, { choices: [] })

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    await expect(responder.generateReply(BASE_INPUT)).rejects.toBeInstanceOf(
      AiChatProviderError,
    )
  })

  it('throws AiChatUnavailableError when credentials are missing', async function run() {
    const { fetchImpl } = createFetchStub(200, {
      choices: [{ message: { role: 'assistant', content: 'reply' } }],
    })

    const responder = createAiGatewayResponder({
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    await expect(responder.generateReply(BASE_INPUT)).rejects.toBeInstanceOf(
      AiChatUnavailableError,
    )
  })

  it('throws AiChatUnavailableError when the network request fails', async function run() {
    const fetchImpl: typeof fetch = (async () => {
      throw new Error('network down')
    }) as typeof fetch

    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      fetch: fetchImpl,
    })

    await expect(responder.generateReply(BASE_INPUT)).rejects.toBeInstanceOf(
      AiChatUnavailableError,
    )
  })
})

describe('createAiGatewayResponder apiBaseUrl', function apiBaseUrlSuite() {
  it('uses the override base for the direct run endpoint', async function run() {
    const { fetchImpl, lastRequest } = createFetchStub(200, { result: { response: 'ok' } })
    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      apiBaseUrl: 'http://fakes:9000/client/v4/',
      fetch: fetchImpl,
    })

    await responder.generateReply(BASE_INPUT)

    expect(lastRequest.url).toBe(
      'http://fakes:9000/client/v4/accounts/acct-1/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    )
  })

  it('uses the override base for the gateway chat-completions endpoint', async function run() {
    const { fetchImpl, lastRequest } = createFetchStub(200, {
      choices: [{ message: { content: 'ok' } }],
    })
    const responder = createAiGatewayResponder({
      accountId: 'acct-1',
      apiToken: 'tok-1',
      gatewayId: 'gw-1',
      apiBaseUrl: 'http://fakes:9000/client/v4',
      fetch: fetchImpl,
    })

    await responder.generateReply(BASE_INPUT)

    expect(lastRequest.url).toBe('http://fakes:9000/client/v4/accounts/acct-1/ai/v1/chat/completions')
  })

  it('throws for an invalid override base', function run() {
    expect(() =>
      createAiGatewayResponder({ accountId: 'a', apiToken: 't', apiBaseUrl: 'nope' }),
    ).toThrow('CLOUDFLARE_API_BASE_URL')
  })
})
