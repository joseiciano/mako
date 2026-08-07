import type {
  SpeechSynthesisConstructor,
  SpeechSynthesisErrorEvent,
  SpeechSynthesisLike,
  SpeechSynthesisUtteranceLike,
} from './ai-chat-synthesis-types'

/**
 * Typed fake browser Web Speech synthesis implementation used by tests to
 * drive the playback hook and the AIChatSmart integration. Mirrors the minimal
 * `SpeechSynthesisLike` + `SpeechSynthesisUtteranceLike` surface the app
 * depends on, without any `any`.
 */
export class FakeSpeechSynthesisUtterance implements SpeechSynthesisUtteranceLike {
  static latest: FakeSpeechSynthesisUtterance | null = null

  text = ''
  lang = ''
  rate = 1
  pitch = 1
  volume = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null

  constructor() {
    FakeSpeechSynthesisUtterance.latest = this
  }
}

export const FakeSpeechSynthesisUtteranceConstructor =
  FakeSpeechSynthesisUtterance as unknown as SpeechSynthesisConstructor

export class FakeSpeechSynthesis implements SpeechSynthesisLike {
  static latest: FakeSpeechSynthesis | null = null

  speaking = false
  paused = false
  pending = false
  lastSpokenText: string | null = null
  speakCalls: FakeSpeechSynthesisUtterance[] = []
  cancelCalls = 0

  constructor() {
    FakeSpeechSynthesis.latest = this
  }

  speak(utterance: SpeechSynthesisUtteranceLike) {
    this.speakCalls.push(utterance as FakeSpeechSynthesisUtterance)
    this.lastSpokenText = utterance.text
    this.speaking = true
    utterance.onstart?.()
  }

  cancel() {
    this.cancelCalls += 1
    this.speaking = false
  }

  pause() {
    this.paused = true
  }

  resume() {
    this.paused = false
  }
}

export function resetFakeSpeechSynthesis() {
  FakeSpeechSynthesis.latest = null
  FakeSpeechSynthesisUtterance.latest = null
}

type SpeechSynthesisWindow = {
  speechSynthesis?: SpeechSynthesisLike
  SpeechSynthesisUtterance?: SpeechSynthesisConstructor
}

export function installSpeechSynthesis(
  synthesis: SpeechSynthesisLike | null,
  utteranceConstructor: SpeechSynthesisConstructor | null,
) {
  const speechWindow = window as unknown as SpeechSynthesisWindow
  if (synthesis) {
    speechWindow.speechSynthesis = synthesis
  } else {
    delete speechWindow.speechSynthesis
  }
  if (utteranceConstructor) {
    speechWindow.SpeechSynthesisUtterance = utteranceConstructor
  } else {
    delete speechWindow.SpeechSynthesisUtterance
  }
}
