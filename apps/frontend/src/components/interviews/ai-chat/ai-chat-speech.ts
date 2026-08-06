import type { SpeechRecognitionConstructor } from './ai-chat-speech-types'

export const SPEECH_NOT_SUPPORTED_MESSAGE =
  'Speech recognition is not supported in this browser. You can still type your questions.'

type SpeechRecognitionWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

/**
 * Resolves the browser's speech recognition constructor (standard or webkit
 * prefixed). Returns null outside the browser (SSR) and when no implementation
 * exists so callers can degrade gracefully to typed input.
 */
export function getBrowserSpeechRecognitionConstructor(
  scope: Window | undefined = typeof window === 'undefined' ? undefined : window,
): SpeechRecognitionConstructor | null {
  if (!scope) return null
  const candidate = scope as unknown as SpeechRecognitionWindow
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}
