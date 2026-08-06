/**
 * Minimal browser Web Speech synthesis surface used by the app. The full
 * `SpeechSynthesis` + `SpeechSynthesisUtterance` API is not part of
 * TypeScript's DOM lib, so this local contract keeps the adapter typed
 * without `any` while staying compatible with the browser implementation.
 */

export type AIChatPlaybackState = 'idle' | 'speaking'

export type SpeechSynthesisErrorEvent = {
  error: string
  message?: string
}

export type SpeechSynthesisUtteranceLike = {
  text: string
  lang: string
  rate: number
  pitch: number
  volume: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null
}

export type SpeechSynthesisLike = {
  speaking: boolean
  paused: boolean
  pending: boolean
  speak: (utterance: SpeechSynthesisUtteranceLike) => void
  cancel: () => void
  pause: () => void
  resume: () => void
}

export type SpeechSynthesisConstructor = new () => SpeechSynthesisUtteranceLike
