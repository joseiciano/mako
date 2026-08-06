import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognitionLike,
} from './ai-chat-speech-types'

/**
 * Typed fake browser SpeechRecognition implementation used by tests to drive
 * the speech hook and the AIChatSmart integration. Mirrors the minimal
 * `SpeechRecognitionLike` surface the app depends on.
 */
export class FakeSpeechRecognition implements SpeechRecognitionLike {
  static latest: FakeSpeechRecognition | null = null

  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null
  onend: (() => void) | null = null
  onstart: (() => void) | null = null

  constructor() {
    FakeSpeechRecognition.latest = this
  }

  start() {
    this.onstart?.()
  }

  stop() {}

  abort() {
    this.onend?.()
  }
}

export const FakeSpeechRecognitionConstructor =
  FakeSpeechRecognition as unknown as SpeechRecognitionConstructor

export function resetFakeSpeechRecognition() {
  FakeSpeechRecognition.latest = null
}

export function installSpeechRecognition(
  constructor: SpeechRecognitionConstructor | null,
) {
  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  if (constructor) {
    speechWindow.SpeechRecognition = constructor
  } else {
    delete speechWindow.SpeechRecognition
    delete speechWindow.webkitSpeechRecognition
  }
}

export function finalResultEvent(transcript: string): SpeechRecognitionEvent {
  return {
    resultIndex: 0,
    results: {
      length: 1,
      0: { isFinal: true, 0: { transcript } },
    },
  }
}

export function interimResultEvent(transcript: string): SpeechRecognitionEvent {
  return {
    resultIndex: 0,
    results: {
      length: 1,
      0: { isFinal: false, 0: { transcript } },
    },
  }
}
