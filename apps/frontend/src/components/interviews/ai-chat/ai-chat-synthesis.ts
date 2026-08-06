import type {
  SpeechSynthesisConstructor,
  SpeechSynthesisLike,
} from './ai-chat-synthesis-types'

export const TTS_NOT_SUPPORTED_MESSAGE =
  'Voice playback is not supported in this browser. You can still read AI replies as text.'

export const TTS_START_ERROR_MESSAGE = 'Could not start voice playback. Try again.'

export type SpeechSynthesisSupport = {
  synthesis: SpeechSynthesisLike
  utteranceConstructor: SpeechSynthesisConstructor
}

type SpeechSynthesisWindow = {
  speechSynthesis?: SpeechSynthesisLike
  SpeechSynthesisUtterance?: SpeechSynthesisConstructor
}

/**
 * Resolves the browser's speech synthesis controller and utterance
 * constructor. Returns null outside the browser (SSR) or when either half of
 * the Web Speech synthesis API is missing, so callers can degrade gracefully
 * to text-only AI replies.
 */
export function getBrowserSpeechSynthesis(
  scope: Window | undefined = typeof window === 'undefined' ? undefined : window,
): SpeechSynthesisSupport | null {
  if (!scope) return null
  const candidate = scope as unknown as SpeechSynthesisWindow
  const synthesis = candidate.speechSynthesis
  const utteranceConstructor = candidate.SpeechSynthesisUtterance
  if (!synthesis || !utteranceConstructor) return null
  return { synthesis, utteranceConstructor }
}

export function describeSynthesisError(error: string): string {
  switch (error) {
    case 'not-allowed':
      return 'Voice playback was denied by the browser. You can still read AI replies as text.'
    case 'interrupted':
      return 'Voice playback was interrupted. Use Replay to hear the reply again.'
    case 'network':
      return 'Voice playback could not reach the network. You can still read AI replies as text.'
    case 'audio-busy':
      return 'Audio playback is busy right now. Try again in a moment.'
    default:
      return 'Could not play the AI reply aloud. You can still read it as text.'
  }
}
