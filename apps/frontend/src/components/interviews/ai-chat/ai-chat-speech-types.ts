export type AIChatVoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'ready-to-send'
  | 'failed'

export type SpeechRecognitionErrorEvent = {
  error: string
  message?: string
}

export type SpeechRecognitionAlternative = {
  transcript: string
}

export type SpeechRecognitionResult = {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}

export type SpeechRecognitionResultList = {
  length: number
  [index: number]: SpeechRecognitionResult
}

export type SpeechRecognitionEvent = {
  resultIndex: number
  results: SpeechRecognitionResultList
}

/**
 * Minimal browser `SpeechRecognition` surface used by the app. The full Web
 * Speech API is not part of TypeScript's DOM lib, so this local contract keeps
 * the adapter typed without `any` while staying compatible with both the
 * standard and `webkit` prefixed browser implementations.
 */
export type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
