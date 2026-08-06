import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useAIChatSynthesis } from './use-ai-chat-synthesis'
import {
  FakeSpeechSynthesis,
  FakeSpeechSynthesisUtterance,
  FakeSpeechSynthesisUtteranceConstructor,
  installSpeechSynthesis,
  resetFakeSpeechSynthesis,
} from './ai-chat-synthesis.test-helpers'

function PlaybackSupportProbe() {
  const { playbackSupported } = useAIChatSynthesis()
  return <span>{playbackSupported ? 'supported' : 'unsupported'}</span>
}

function installSupportedSynthesis() {
  const synthesis = new FakeSpeechSynthesis()
  installSpeechSynthesis(synthesis, FakeSpeechSynthesisUtteranceConstructor)
  return synthesis
}

describe('useAIChatSynthesis', function () {
  beforeEach(function () {
    resetFakeSpeechSynthesis()
    installSpeechSynthesis(null, null)
  })

  afterEach(function () {
    installSpeechSynthesis(null, null)
  })

  it('reports unsupported during SSR render, then detects support after mount', function () {
    const synthesis = installSupportedSynthesis()
    try {
      // SSR pass: renderToString runs no effects, so support must not be
      // detected during render even though a browser API exists.
      const html = renderToString(<PlaybackSupportProbe />)
      expect(html).toContain('unsupported')

      // Mounted pass: the mount effect detects the API and playback works.
      const { result } = renderHook(function () {
        return useAIChatSynthesis()
      })
      expect(result.current.playbackSupported).toBe(true)
      act(function () {
        result.current.playReply('Hello')
      })
      expect(synthesis.speakCalls).toHaveLength(1)
    } finally {
      installSpeechSynthesis(null, null)
    }
  })

  it('reports unsupported when no synthesis API is available', function () {
    const { result } = renderHook(function () {
      return useAIChatSynthesis({ getSynthesis: () => null })
    })
    expect(result.current.playbackSupported).toBe(false)
    expect(result.current.playbackState).toBe('idle')
  })

  it('speaks a reply and enters speaking state', function () {
    const synthesis = installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('Review the box model.')
    })
    expect(synthesis.speakCalls).toHaveLength(1)
    expect(synthesis.lastSpokenText).toBe('Review the box model.')
    expect(result.current.playbackState).toBe('speaking')
    expect(result.current.canReplay).toBe(true)
  })

  it('ignores empty or whitespace-only replies', function () {
    const synthesis = installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('   ')
    })
    expect(synthesis.speakCalls).toHaveLength(0)
    expect(result.current.canReplay).toBe(false)
  })

  it('returns to idle when playback ends', function () {
    installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('Done.')
    })
    act(function () {
      FakeSpeechSynthesisUtterance.latest?.onend?.()
    })
    expect(result.current.playbackState).toBe('idle')
  })

  it('surfaces an error message when synthesis fails', function () {
    installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('Say this.')
    })
    act(function () {
      FakeSpeechSynthesisUtterance.latest?.onerror?.({ error: 'network' })
    })
    expect(result.current.playbackState).toBe('idle')
    expect(result.current.playbackErrorMessage).toMatch(/network/i)
  })

  it('replays the last spoken reply', function () {
    const synthesis = installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('First reply.')
    })
    act(function () {
      FakeSpeechSynthesisUtterance.latest?.onend?.()
    })
    act(function () {
      result.current.replay()
    })
    expect(synthesis.speakCalls).toHaveLength(2)
    expect(synthesis.lastSpokenText).toBe('First reply.')
  })

  it('does nothing when replay is requested before any reply', function () {
    const synthesis = installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.replay()
    })
    expect(synthesis.speakCalls).toHaveLength(0)
    expect(result.current.canReplay).toBe(false)
  })

  it('stops playback and ignores late callbacks from the canceled utterance', function () {
    const synthesis = installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('Stop me.')
    })
    const canceled = FakeSpeechSynthesisUtterance.latest
    act(function () {
      result.current.stopPlayback()
    })
    expect(synthesis.cancelCalls).toBeGreaterThan(0)
    expect(result.current.playbackState).toBe('idle')

    // Stale events from the canceled utterance must not flip the state again.
    act(function () {
      canceled?.onstart?.()
      canceled?.onend?.()
      canceled?.onerror?.({ error: 'canceled' })
    })
    expect(result.current.playbackState).toBe('idle')
    expect(result.current.playbackErrorMessage).toBeNull()
  })

  it('replaces an in-flight utterance when a new reply starts (no overlap)', function () {
    const synthesis = installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('First.')
    })
    const first = FakeSpeechSynthesisUtterance.latest
    act(function () {
      result.current.playReply('Second.')
    })
    const second = FakeSpeechSynthesisUtterance.latest
    expect(synthesis.cancelCalls).toBeGreaterThan(0)
    expect(second).not.toBe(first)
    expect(synthesis.lastSpokenText).toBe('Second.')

    // A stale end event from the replaced utterance must not clear the new state.
    act(function () {
      first?.onend?.()
    })
    expect(result.current.playbackState).toBe('speaking')
  })

  it('mutes playback, stops current speech, and blocks further auto-play', function () {
    const synthesis = installSupportedSynthesis()
    const { result } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('Audible.')
    })
    expect(result.current.playbackMuted).toBe(false)
    act(function () {
      result.current.toggleMuted()
    })
    expect(result.current.playbackMuted).toBe(true)
    expect(result.current.playbackState).toBe('idle')
    expect(synthesis.cancelCalls).toBeGreaterThan(0)

    act(function () {
      result.current.playReply('Silent now.')
    })
    expect(synthesis.speakCalls).toHaveLength(1)
    expect(result.current.playbackState).toBe('idle')
  })

  it('cancels playback on unmount', function () {
    const synthesis = installSupportedSynthesis()
    const { result, unmount } = renderHook(function () {
      return useAIChatSynthesis()
    })
    act(function () {
      result.current.playReply('Bye.')
    })
    unmount()
    expect(synthesis.cancelCalls).toBeGreaterThan(0)
  })
})
