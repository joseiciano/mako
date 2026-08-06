import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useAIChatSpeech } from './use-ai-chat-speech'
import {
  FakeSpeechRecognition,
  FakeSpeechRecognitionConstructor,
  finalResultEvent,
  installSpeechRecognition,
  interimResultEvent,
  resetFakeSpeechRecognition,
} from './ai-chat-speech.test-helpers'

function VoiceSupportProbe() {
  const { voiceSupported } = useAIChatSpeech()
  return <span>{voiceSupported ? 'supported' : 'unsupported'}</span>
}

describe('useAIChatSpeech', function () {
  beforeEach(function () {
    resetFakeSpeechRecognition()
  })

  it('reports voice unsupported during SSR render, then detects support after mount', function () {
    installSpeechRecognition(FakeSpeechRecognitionConstructor)
    try {
      // SSR pass: renderToString runs no effects, so support must not be
      // detected during render even though a browser constructor exists.
      const html = renderToString(<VoiceSupportProbe />)
      expect(html).toContain('unsupported')

      // Mounted pass: the mount effect detects the constructor and enables
      // listening.
      const { result } = renderHook(function () {
        return useAIChatSpeech()
      })
      expect(result.current.voiceSupported).toBe(true)
      act(function () {
        result.current.startListening()
      })
      expect(result.current.voiceState).toBe('listening')
    } finally {
      installSpeechRecognition(null)
    }
  })

  it('reports voice unsupported when no recognizer constructor is available', function () {
    const { result } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => null })
    })
    expect(result.current.voiceSupported).toBe(false)
    expect(result.current.voiceState).toBe('idle')
  })

  it('enters listening state when a capture starts', function () {
    const { result } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => FakeSpeechRecognitionConstructor })
    })
    act(function () {
      result.current.startListening()
    })
    expect(result.current.voiceState).toBe('listening')
  })

  it('surfaces interim transcripts while listening', function () {
    const { result } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => FakeSpeechRecognitionConstructor })
    })
    act(function () {
      result.current.startListening()
    })
    act(function () {
      FakeSpeechRecognition.latest?.onresult?.(interimResultEvent('Speak'))
    })
    expect(result.current.voiceInterimTranscript).toBe('Speak')
    expect(result.current.voiceState).toBe('listening')
  })

  it('delivers the final transcript and reaches ready-to-send', function () {
    const onFinalTranscript = vi.fn()
    const { result } = renderHook(function () {
      return useAIChatSpeech({
        getConstructor: () => FakeSpeechRecognitionConstructor,
        onFinalTranscript,
      })
    })
    act(function () {
      result.current.startListening()
    })
    act(function () {
      FakeSpeechRecognition.latest?.onresult?.(finalResultEvent('Hello world'))
    })
    expect(onFinalTranscript).toHaveBeenCalledWith('Hello world')

    act(function () {
      FakeSpeechRecognition.latest?.onend?.()
    })
    expect(result.current.voiceState).toBe('ready-to-send')
  })

  it('moves to failed with a message on permission errors', function () {
    const { result } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => FakeSpeechRecognitionConstructor })
    })
    act(function () {
      result.current.startListening()
    })
    act(function () {
      FakeSpeechRecognition.latest?.onerror?.({ error: 'not-allowed' })
      FakeSpeechRecognition.latest?.onend?.()
    })
    expect(result.current.voiceState).toBe('failed')
    expect(result.current.voiceErrorMessage).toMatch(/microphone access/i)
  })

  it('stays failed when the recognizer ends after an error', function () {
    const { result } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => FakeSpeechRecognitionConstructor })
    })
    act(function () {
      result.current.startListening()
    })
    act(function () {
      FakeSpeechRecognition.latest?.onerror?.({ error: 'audio-capture' })
    })
    expect(result.current.voiceState).toBe('failed')
    expect(result.current.voiceErrorMessage).toMatch(/microphone/i)

    act(function () {
      FakeSpeechRecognition.latest?.onend?.()
    })
    expect(result.current.voiceState).toBe('failed')
  })

  it('returns to idle when the user stops listening', function () {
    const { result } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => FakeSpeechRecognitionConstructor })
    })
    act(function () {
      result.current.startListening()
    })
    act(function () {
      result.current.stopListening()
    })
    expect(result.current.voiceState).toBe('idle')
  })

  it('ignores stale onresult/onerror callbacks from a stopped recognizer', function () {
    const onFinalTranscript = vi.fn()
    const { result } = renderHook(function () {
      return useAIChatSpeech({
        getConstructor: () => FakeSpeechRecognitionConstructor,
        onFinalTranscript,
      })
    })
    act(function () {
      result.current.startListening()
    })
    const stale = FakeSpeechRecognition.latest
    act(function () {
      result.current.stopListening()
    })
    act(function () {
      stale?.onresult?.(finalResultEvent('Late hello'))
    })
    expect(onFinalTranscript).not.toHaveBeenCalled()
    expect(result.current.voiceState).toBe('idle')
    expect(result.current.voiceInterimTranscript).toBe('')

    act(function () {
      stale?.onerror?.({ error: 'network' })
    })
    expect(result.current.voiceState).toBe('idle')
    expect(result.current.voiceErrorMessage).toBeNull()
  })

  it('ignores stale callbacks from a recognizer replaced by restart', function () {
    const { result } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => FakeSpeechRecognitionConstructor })
    })
    act(function () {
      result.current.startListening()
    })
    const stale = FakeSpeechRecognition.latest
    act(function () {
      result.current.stopListening()
    })
    act(function () {
      result.current.startListening()
    })
    const current = FakeSpeechRecognition.latest
    expect(current).not.toBe(stale)

    act(function () {
      stale?.onstart?.()
      stale?.onresult?.(interimResultEvent('Stale interim'))
      stale?.onerror?.({ error: 'network' })
    })

    expect(result.current.voiceState).toBe('listening')
    expect(result.current.voiceInterimTranscript).toBe('')
    expect(result.current.voiceErrorMessage).toBeNull()
  })

  it('resets to idle and clears errors on resetVoice', function () {
    const { result } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => FakeSpeechRecognitionConstructor })
    })
    act(function () {
      result.current.startListening()
    })
    act(function () {
      FakeSpeechRecognition.latest?.onerror?.({ error: 'network' })
    })
    expect(result.current.voiceState).toBe('failed')
    act(function () {
      result.current.resetVoice()
    })
    expect(result.current.voiceState).toBe('idle')
    expect(result.current.voiceErrorMessage).toBeNull()
  })

  it('aborts the active recognizer on unmount', function () {
    const { result, unmount } = renderHook(function () {
      return useAIChatSpeech({ getConstructor: () => FakeSpeechRecognitionConstructor })
    })
    act(function () {
      result.current.startListening()
    })
    const recognizer = FakeSpeechRecognition.latest
    expect(recognizer).not.toBeNull()
    const abortSpy = vi.spyOn(recognizer as FakeSpeechRecognition, 'abort')
    unmount()
    expect(abortSpy).toHaveBeenCalledOnce()
  })
})
