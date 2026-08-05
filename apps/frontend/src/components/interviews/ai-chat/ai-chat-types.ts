export type AIChatMessageRole = 'user' | 'assistant'

export type AIChatMessage = {
  id: string
  role: AIChatMessageRole
  content: string
  isError?: boolean
}

export type AIChatSubmitState = 'idle' | 'sending' | 'success' | 'error'

export type AIChatDumbProps = {
  messages: AIChatMessage[]
  inputValue: string
  submitState: AIChatSubmitState
  errorMessage: string | null
  disabled: boolean
  canRetry: boolean
  retryLimitReached: boolean
  onInputChange: (value: string) => void
  onSubmit: () => void
  onRetry: () => void
}
