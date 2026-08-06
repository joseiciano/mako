import { describe, expect, it } from 'vitest'
import { getBrowserSpeechRecognitionConstructor } from './ai-chat-speech'
import { FakeSpeechRecognition } from './ai-chat-speech.test-helpers'

describe('getBrowserSpeechRecognitionConstructor', function () {
  it('returns null when the window exposes no recognition API', function () {
    const scope = {} as Window
    expect(getBrowserSpeechRecognitionConstructor(scope)).toBeNull()
  })

  it('returns window.SpeechRecognition when present', function () {
    const scope = { SpeechRecognition: FakeSpeechRecognition } as unknown as Window
    expect(getBrowserSpeechRecognitionConstructor(scope)).toBe(FakeSpeechRecognition)
  })

  it('falls back to webkitSpeechRecognition', function () {
    const scope = {
      webkitSpeechRecognition: FakeSpeechRecognition,
    } as unknown as Window
    expect(getBrowserSpeechRecognitionConstructor(scope)).toBe(FakeSpeechRecognition)
  })

  it('prefers SpeechRecognition over webkitSpeechRecognition', function () {
    class PreferStandard {}
    const scope = {
      SpeechRecognition: PreferStandard,
      webkitSpeechRecognition: FakeSpeechRecognition,
    } as unknown as Window
    expect(getBrowserSpeechRecognitionConstructor(scope)).toBe(PreferStandard)
  })

  it('returns null when window is undefined (SSR)', function () {
    expect(getBrowserSpeechRecognitionConstructor(undefined)).toBeNull()
  })
})
