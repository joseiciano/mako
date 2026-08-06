export type AIChatMessageRole = 'user' | 'assistant'

export type AIChatMessage = {
  id: string
  role: AIChatMessageRole
  content: string
  isError?: boolean
}

export type AIChatSubmitState = 'idle' | 'sending' | 'success' | 'error'

import type { AIChatVoiceState } from './ai-chat-speech-types'

export type { AIChatVoiceState } from './ai-chat-speech-types'

export type AIChatDumbProps = {
  messages: AIChatMessage[]
  inputValue: string
  submitState: AIChatSubmitState
  errorMessage: string | null
  disabled: boolean
  canRetry: boolean
  retryLimitReached: boolean
  voiceState: AIChatVoiceState
  voiceErrorMessage: string | null
  voiceSupported: boolean
  voiceInterimTranscript: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  onRetry: () => void
  onVoiceToggle: () => void
}
