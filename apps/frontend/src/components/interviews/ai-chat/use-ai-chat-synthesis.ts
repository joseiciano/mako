import { useEffect, useRef, useState } from 'react'
import type { AIChatPlaybackState } from './ai-chat-synthesis-types'
import type {
  SpeechSynthesisLike,
  SpeechSynthesisUtteranceLike,
} from './ai-chat-synthesis-types'
import {
  describeSynthesisError,
  getBrowserSpeechSynthesis,
  TTS_START_ERROR_MESSAGE,
} from './ai-chat-synthesis'
import type { SpeechSynthesisSupport } from './ai-chat-synthesis'

export type UseAIChatSynthesisOptions = {
  getSynthesis?: () => SpeechSynthesisSupport | null
}

export type UseAIChatSynthesisResult = {
  playbackState: AIChatPlaybackState
  playbackSupported: boolean
  playbackMuted: boolean
  canReplay: boolean
  playbackErrorMessage: string | null
  playReply: (text: string) => void
  stopPlayback: () => void
  replay: () => void
  toggleMuted: () => void
}

/**
 * Owns browser text-to-speech playback for AI chat replies. Playback is always
 * anchored to the reply content already rendered in the chat UI (the caller
 * passes the exact `reply` text) and never logs or persists spoken content.
 *
 * Runtime guards:
 * - SSR-safe: synthesis support is only probed in a mount effect, so server
 *   and client render the same initial output.
 * - No overlapping speech: starting a new reply cancels the in-flight one.
 * - Stale callback safety: start/end/error events from a replaced or canceled
 *   utterance are ignored, and handlers are detached before cancel.
 * - Unmount safety: the active utterance is canceled on unmount.
 * - Mute: while muted, auto-play and replay no-op; the last reply text is still
 *   retained so Replay works again after unmuting. The muted flag is tracked
 *   in a ref, so a reply callback created before a mute toggle still honors the
 *   mute when it executes (e.g. a chat reply that resolves after muting).
 */
export function useAIChatSynthesis(
  options: UseAIChatSynthesisOptions = {},
): UseAIChatSynthesisResult {
  const resolveSynthesis = options.getSynthesis ?? getBrowserSpeechSynthesis
  const [playbackState, setPlaybackState] = useState<AIChatPlaybackState>('idle')
  const [playbackSupported, setPlaybackSupported] = useState(false)
  const [playbackMuted, setPlaybackMuted] = useState(false)
  const [playbackErrorMessage, setPlaybackErrorMessage] = useState<string | null>(null)
  const currentUtteranceRef = useRef<SpeechSynthesisUtteranceLike | null>(null)
  const lastSpokenTextRef = useRef<string | null>(null)
  // Mirrors `playbackMuted` synchronously so callbacks that were created in an
  // earlier render (e.g. an AI chat mutation's onSuccess) can honor mute state
  // at execution time rather than the value captured in their stale closure.
  const playbackMutedRef = useRef(false)

  useEffect(function detectPlaybackSupportOnMount() {
    setPlaybackSupported(resolveSynthesis() !== null)
  }, [])

  useEffect(function cancelPlaybackOnUnmount() {
    return function cleanup() {
      const support = resolveSynthesis()
      const current = currentUtteranceRef.current
      if (current) {
        currentUtteranceRef.current = null
        clearUtteranceHandlers(current)
      }
      support?.synthesis.cancel()
    }
  }, [])

  function cancelCurrentUtterance(synthesis: SpeechSynthesisLike) {
    const current = currentUtteranceRef.current
    if (!current) return
    currentUtteranceRef.current = null
    clearUtteranceHandlers(current)
    synthesis.cancel()
  }

  function playReply(text: string) {
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    // Retain the last reply text even while muted so Replay works after
    // unmuting, but never speak while muted (read from the ref so a callback
    // created before a mute toggle still honors the mute at execution time).
    lastSpokenTextRef.current = trimmed
    if (playbackMutedRef.current) return

    const support = resolveSynthesis()
    if (!support) return

    cancelCurrentUtterance(support.synthesis)
    setPlaybackErrorMessage(null)

    let utterance: SpeechSynthesisUtteranceLike
    try {
      utterance = new support.utteranceConstructor()
    } catch {
      setPlaybackState('idle')
      setPlaybackErrorMessage(TTS_START_ERROR_MESSAGE)
      return
    }

    utterance.text = trimmed
    utterance.lang = 'en-US'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1

    currentUtteranceRef.current = utterance

    utterance.onstart = function handleStart() {
      if (currentUtteranceRef.current !== utterance) return
      setPlaybackState('speaking')
    }

    utterance.onend = function handleEnd() {
      if (currentUtteranceRef.current !== utterance) return
      currentUtteranceRef.current = null
      setPlaybackState('idle')
    }

    utterance.onerror = function handleError(event) {
      if (currentUtteranceRef.current !== utterance) return
      currentUtteranceRef.current = null
      setPlaybackState('idle')
      setPlaybackErrorMessage(describeSynthesisError(event.error))
    }

    try {
      support.synthesis.speak(utterance)
    } catch {
      if (currentUtteranceRef.current === utterance) {
        currentUtteranceRef.current = null
      }
      setPlaybackState('idle')
      setPlaybackErrorMessage(TTS_START_ERROR_MESSAGE)
    }
  }

  function stopPlayback() {
    const support = resolveSynthesis()
    const current = currentUtteranceRef.current
    if (current) {
      currentUtteranceRef.current = null
      clearUtteranceHandlers(current)
    }
    support?.synthesis.cancel()
    setPlaybackState('idle')
    setPlaybackErrorMessage(null)
  }

  function replay() {
    const lastSpokenText = lastSpokenTextRef.current
    if (!lastSpokenText) return
    playReply(lastSpokenText)
  }

  function toggleMuted() {
    if (!playbackMuted) {
      stopPlayback()
    }
    playbackMutedRef.current = !playbackMuted
    setPlaybackMuted(!playbackMuted)
  }

  return {
    playbackState,
    playbackSupported,
    playbackMuted,
    canReplay: lastSpokenTextRef.current !== null,
    playbackErrorMessage,
    playReply,
    stopPlayback,
    replay,
    toggleMuted,
  }
}

function clearUtteranceHandlers(utterance: SpeechSynthesisUtteranceLike) {
  utterance.onstart = null
  utterance.onend = null
  utterance.onerror = null
}
