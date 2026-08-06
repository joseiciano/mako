import { describe, expect, it } from 'vitest'
import {
  describeSynthesisError,
  getBrowserSpeechSynthesis,
} from './ai-chat-synthesis'
import {
  FakeSpeechSynthesis,
  FakeSpeechSynthesisUtteranceConstructor,
} from './ai-chat-synthesis.test-helpers'

describe('getBrowserSpeechSynthesis', function () {
  it('returns null when the window exposes no synthesis API', function () {
    const scope = {} as Window
    expect(getBrowserSpeechSynthesis(scope)).toBeNull()
  })

  it('returns null when only the utterance constructor exists', function () {
    const scope = {
      SpeechSynthesisUtterance: FakeSpeechSynthesisUtteranceConstructor,
    } as unknown as Window
    expect(getBrowserSpeechSynthesis(scope)).toBeNull()
  })

  it('returns null when only the speechSynthesis controller exists', function () {
    const synthesis = new FakeSpeechSynthesis()
    const scope = { speechSynthesis: synthesis } as unknown as Window
    expect(getBrowserSpeechSynthesis(scope)).toBeNull()
  })

  it('returns synthesis support when both APIs exist', function () {
    const synthesis = new FakeSpeechSynthesis()
    const scope = {
      speechSynthesis: synthesis,
      SpeechSynthesisUtterance: FakeSpeechSynthesisUtteranceConstructor,
    } as unknown as Window
    const support = getBrowserSpeechSynthesis(scope)
    expect(support).not.toBeNull()
    expect(support?.synthesis).toBe(synthesis)
    expect(support?.utteranceConstructor).toBe(FakeSpeechSynthesisUtteranceConstructor)
  })

  it('returns null when window is undefined (SSR)', function () {
    expect(getBrowserSpeechSynthesis(undefined)).toBeNull()
  })
})

describe('describeSynthesisError', function () {
  it('maps permission errors to a user-facing message', function () {
    expect(describeSynthesisError('not-allowed')).toMatch(/denied/i)
  })

  it('maps interruption errors to a recovery message', function () {
    expect(describeSynthesisError('interrupted')).toMatch(/interrupted/i)
  })

  it('maps network errors to a connectivity message', function () {
    expect(describeSynthesisError('network')).toMatch(/network/i)
  })

  it('falls back to a generic message for unknown errors', function () {
    expect(describeSynthesisError('mystery-error')).toMatch(/could not play/i)
  })
})
