import { buildCloudflareApiUrl } from '../cloudflare-api-url'
import { AiChatUnavailableError } from './ai-chat-repository'
import {
  AI_CHAT_PROMPT_VERSION,
  buildAiChatMessages,
} from './ai-chat-prompt'
import type {
  AiChatServiceInput,
  AiChatServicePort,
  AiChatServiceResult,
} from './types'

export { AI_CHAT_PROMPT_VERSION }

export class AiChatProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiChatProviderError'
  }
}

export type AiGatewayResponderOptions = {
  accountId?: string
  apiToken?: string
  gatewayId?: string
  apiBaseUrl?: string
  fetch?: typeof fetch
}

const AI_CHAT_FETCH_TIMEOUT_MS = 30_000
const AI_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const CACHE_BYPASS_HEADER = 'true'
const AI_CHAT_TIMEOUT_HEADER_MS = '30000'

export function createAiGatewayResponder(
  options: AiGatewayResponderOptions,
): AiChatServicePort {
  const accountId = options.accountId
  const apiToken = options.apiToken
  const gatewayId = options.gatewayId
  const fetchImpl = options.fetch ?? globalThis.fetch

  const chatCompletionsEndpoint = buildCloudflareApiUrl(
    options.apiBaseUrl,
    `/accounts/${accountId}/ai/v1/chat/completions`,
  )
  const runEndpoint = buildCloudflareApiUrl(
    options.apiBaseUrl,
    `/accounts/${accountId}/ai/run/${AI_CHAT_MODEL}`,
  )

  return {
    async generateReply(input: AiChatServiceInput): Promise<AiChatServiceResult> {
      if (!accountId || !apiToken) {
        throw new AiChatUnavailableError()
      }

      const messages = buildAiChatMessages(input)

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      }
      const body: Record<string, unknown> = gatewayId
        ? { model: AI_CHAT_MODEL, messages }
        : { messages }

      if (gatewayId) {
        headers['cf-aig-gateway-id'] = gatewayId
        headers['cf-aig-skip-cache'] = CACHE_BYPASS_HEADER
        headers['cf-aig-request-timeout'] = AI_CHAT_TIMEOUT_HEADER_MS
      }

      const endpoint = gatewayId ? chatCompletionsEndpoint : runEndpoint

      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(AI_CHAT_FETCH_TIMEOUT_MS),
        })
      } catch {
        throw new AiChatUnavailableError('AI provider is unreachable.')
      }

      if (!response.ok) {
        throw new AiChatProviderError(
          `AI provider returned an error (${response.status}).`,
        )
      }

      const reply = await extractReply(response, gatewayId ? 'chat' : 'run')
      if (!reply) {
        throw new AiChatProviderError('AI provider returned an empty response.')
      }

      return {
        reply,
        guidance_mode: input.guidance_mode,
        prompt_version: AI_CHAT_PROMPT_VERSION,
      }
    },
  }
}

async function extractReply(
  response: Response,
  mode: 'chat' | 'run',
): Promise<string | undefined> {
  const json: unknown = await response.json().catch(() => undefined)
  if (!isRecord(json)) {
    return undefined
  }

  const result = isRecord(json.result) ? json.result : json

  if (mode === 'run') {
    return typeof result.response === 'string' ? result.response : undefined
  }

  const choices = result.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined
  }

  const firstChoice = choices[0]
  if (!isRecord(firstChoice)) {
    return undefined
  }

  const message = firstChoice.message
  if (!isRecord(message)) {
    return undefined
  }

  return typeof message.content === 'string' ? message.content : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
