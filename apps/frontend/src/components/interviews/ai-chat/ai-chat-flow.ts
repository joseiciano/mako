import {
  aiChatMaxHistoryContentLength,
  aiChatMaxHistoryMessages,
} from '@mako/shared'
import type { AiChatHistoryMessage } from '@mako/shared'
import type { AIChatMessage, AIChatSubmitState } from './ai-chat-types'

export const MAX_AI_CHAT_RETRIES = 3

export type AIChatPanelState = {
  messages: AIChatMessage[]
  inputValue: string
  submitState: AIChatSubmitState
  errorMessage: string | null
  lastFailedMessageContent: string | null
  retryCount: number
}

export type AIChatAction =
  | { type: 'INPUT_CHANGED'; payload: string }
  | { type: 'SUBMIT_STARTED'; payload: string }
  | { type: 'SUBMIT_SUCCEEDED'; payload: string }
  | { type: 'SUBMIT_FAILED'; payload: string }
  | { type: 'SUBMIT_REJECTED'; payload: string }
  | { type: 'RETRY_STARTED' }
  | { type: 'RETRY_SUCCEEDED'; payload: string }
  | { type: 'RETRY_FAILED'; payload: string }

export const initialAIChatPanelState: AIChatPanelState = {
  messages: [],
  inputValue: '',
  submitState: 'idle',
  errorMessage: null,
  lastFailedMessageContent: null,
  retryCount: 0,
}

export function aiChatPanelReducer(
  state: AIChatPanelState,
  action: AIChatAction,
): AIChatPanelState {
  switch (action.type) {
    case 'INPUT_CHANGED':
      return {
        ...state,
        inputValue: action.payload,
        errorMessage: action.payload.length > 0 ? null : state.errorMessage,
      }

    case 'SUBMIT_STARTED':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: createChatMessageId(), role: 'user', content: action.payload },
        ],
        inputValue: '',
        submitState: 'sending',
        errorMessage: null,
        lastFailedMessageContent: null,
        retryCount: 0,
      }

    case 'SUBMIT_SUCCEEDED':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: createChatMessageId(), role: 'assistant', content: action.payload },
        ],
        submitState: 'success',
        errorMessage: null,
      }

    case 'SUBMIT_FAILED':
      return {
        ...state,
        messages: markLastMessageInError(state.messages),
        submitState: 'error',
        errorMessage: action.payload,
        lastFailedMessageContent: lastUserMessageContent(state.messages),
      }

    case 'SUBMIT_REJECTED':
      return {
        ...state,
        submitState: 'error',
        errorMessage: action.payload,
        lastFailedMessageContent: null,
      }

    case 'RETRY_STARTED':
      return {
        ...state,
        submitState: 'sending',
        errorMessage: null,
        retryCount: state.retryCount + 1,
      }

    case 'RETRY_SUCCEEDED':
      return {
        ...state,
        messages: [
          ...markLastMessageNotInError(state.messages),
          { id: createChatMessageId(), role: 'assistant', content: action.payload },
        ],
        submitState: 'success',
        errorMessage: null,
        lastFailedMessageContent: null,
      }

    case 'RETRY_FAILED':
      return {
        ...state,
        submitState: 'error',
        errorMessage: action.payload,
      }

    default:
      return state
  }
}

export function createChatMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ai-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function hasReachedRetryLimit(state: Pick<AIChatPanelState, 'retryCount'>): boolean {
  return state.retryCount >= MAX_AI_CHAT_RETRIES
}

export function buildChatHistory(
  messages: AIChatMessage[],
): AiChatHistoryMessage[] {
  const bounded = messages
    .filter(function isNonError(nonErrorMessage) {
      return !nonErrorMessage.isError
    })
    .slice(-aiChatMaxHistoryMessages)

  return bounded.map(function toHistoryMessage(message) {
    return {
      role: message.role,
      content: truncate(message.content, aiChatMaxHistoryContentLength),
    }
  })
}

function lastUserMessageContent(messages: AIChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'user') {
      return message.content
    }
  }
  return null
}

function markLastMessageInError(messages: AIChatMessage[]): AIChatMessage[] {
  return messages.map(function markLast(message, index) {
    return index === messages.length - 1 ? { ...message, isError: true } : message
  })
}

function markLastMessageNotInError(messages: AIChatMessage[]): AIChatMessage[] {
  return messages.map(function markLast(message, index) {
    return index === messages.length - 1 ? { ...message, isError: false } : message
  })
}

export function truncate(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content
  }
  return content.slice(0, maxLength)
}
