import { jsonResponse } from '../http.ts'
import { handleFeedbackAnalysis } from './feedback-analysis.ts'

export const FAKE_CHAT_REPLY =
  'This is a canned local AI reply. Walk through your approach step by step and name the trade-offs you are making.'

const CHAT_COMPLETIONS_PATH = /^\/ai\/v1\/chat\/completions$/
const MODEL_RUN_PATH = /^\/ai\/run\/.+$/

type ChatBody = { response_format?: { type?: unknown } }

function isJsonObjectRequest(body: ChatBody): boolean {
  return body.response_format?.type === 'json_object'
}

/**
 * Fakes the two Workers AI URLs the AI chat responder calls and the AI
 * Gateway chat-completions URL the feedback adapter calls. `path` is relative
 * to `/accounts/:accountId`. A chat-completions request that asks for a JSON
 * object is feedback analysis; any other chat request is a chat reply.
 */
export const handleAiChat = async (request: Request, path: string): Promise<Response | null> => {
  if (request.method !== 'POST') return null

  if (MODEL_RUN_PATH.test(path)) {
    return jsonResponse({ success: true, result: { response: FAKE_CHAT_REPLY } })
  }

  if (!CHAT_COMPLETIONS_PATH.test(path)) return null

  const body = (await request.json().catch(() => ({}))) as ChatBody
  if (isJsonObjectRequest(body)) return handleFeedbackAnalysis()

  return jsonResponse({
    success: true,
    result: { choices: [{ message: { role: 'assistant', content: FAKE_CHAT_REPLY } }] },
  })
}
