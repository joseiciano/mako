import { useEffect, useRef, useState } from 'react'
import { getBrowserSpeechRecognitionConstructor, SPEECH_NOT_SUPPORTED_MESSAGE } from './ai-chat-speech'
import type {
  AIChatVoiceState,
  SpeechRecognitionConstructor,
  SpeechRecognitionLike,
} from './ai-chat-speech-types'

export type UseAIChatSpeechOptions = {
  onFinalTranscript?: (transcript: string) => void
  getConstructor?: () => SpeechRecognitionConstructor | null
}

export type UseAIChatSpeechResult = {
  voiceState: AIChatVoiceState
  voiceErrorMessage: string | null
  voiceSupported: boolean
  voiceInterimTranscript: string
  startListening: () => void
  stopListening: () => void
  resetVoice: () => void
}

const START_SPEECH_RECOGNITION_ERROR_MESSAGE =
  'Could not start speech recognition. Try again.'

export function describeRecognitionError(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. Allow microphone access and try again.'
    case 'audio-capture':
      return 'No microphone was found. Connect a microphone and try again.'
    case 'no-speech':
      return 'No speech was detected. Try again.'
    case 'network':
      return 'Speech recognition could not reach the network. Check your connection and try again.'
    default:
      return 'Speech recognition failed. Try again.'
  }
}

/**
 * Owns the browser speech recognition lifecycle for AI chat voice input.
 * Exposes visible states (idle/listening/transcribing/ready-to-send/failed)
 * and hands recognized final transcripts to the caller, which routes them
 * through the same typed chat submit path. The recognizer is always aborted
 * on unmount.
 */
export function useAIChatSpeech(options: UseAIChatSpeechOptions = {}): UseAIChatSpeechResult {
  const resolveConstructor =
    options.getConstructor ?? getBrowserSpeechRecognitionConstructor
  // Feature detection is deferred to a mount effect so SSR and client render
  // the same initial output (voice unsupported), avoiding hydration mismatch.
  const [voiceSupported, setVoiceSupported] = useState<boolean>(false)
  const [voiceState, setVoiceState] = useState<AIChatVoiceState>('idle')
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null)
  const [voiceInterimTranscript, setVoiceInterimTranscript] = useState('')
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalTranscriptRef = useRef(options.onFinalTranscript)
  onFinalTranscriptRef.current = options.onFinalTranscript

  function clearActiveHandlers(active: SpeechRecognitionLike) {
    active.onstart = null
    active.onresult = null
    active.onerror = null
    active.onend = null
  }

  function abortActiveRecognizer() {
    const active = recognizerRef.current
    if (!active) return
    recognizerRef.current = null
    clearActiveHandlers(active)
    active.abort()
  }

  useEffect(function detectVoiceSupportOnMount() {
    // Runs synchronously once at mount; sets state only while mounted, so no
    // state update can fire after unmount.
    setVoiceSupported(resolveConstructor() !== null)
  }, [])

  useEffect(function cleanupOnUnmount() {
    return function cleanup() {
      const active = recognizerRef.current
      if (!active) return
      recognizerRef.current = null
      clearActiveHandlers(active)
      active.abort()
    }
  }, [])

  function startListening() {
    const constructor = resolveConstructor()
    if (!constructor) {
      setVoiceState('failed')
      setVoiceErrorMessage(SPEECH_NOT_SUPPORTED_MESSAGE)
      return
    }

    abortActiveRecognizer()
    setVoiceErrorMessage(null)
    setVoiceInterimTranscript('')
    setVoiceState('idle')

    let recognition: SpeechRecognitionLike
    try {
      recognition = new constructor()
    } catch {
      setVoiceState('failed')
      setVoiceErrorMessage(START_SPEECH_RECOGNITION_ERROR_MESSAGE)
      return
    }

    recognizerRef.current = recognition
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true

    let failed = false

    recognition.onstart = function handleStart() {
      if (recognizerRef.current !== recognition) return
      setVoiceState('listening')
    }

    recognition.onresult = function handleResult(event) {
      if (recognizerRef.current !== recognition) return
      let interim = ''
      let final = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }

      if (interim.length > 0) {
        setVoiceInterimTranscript(interim)
      }

      if (final.trim().length > 0) {
        setVoiceState('transcribing')
        setVoiceInterimTranscript('')
        onFinalTranscriptRef.current?.(final.trim())
        recognition.stop()
      }
    }

    recognition.onerror = function handleError(event) {
      if (recognizerRef.current !== recognition) return
      failed = true
      setVoiceState('failed')
      setVoiceErrorMessage(describeRecognitionError(event.error))
    }

    recognition.onend = function handleEnd() {
      if (recognizerRef.current !== recognition) return
      recognizerRef.current = null
      setVoiceInterimTranscript('')
      if (failed) return
      setVoiceState(function currentState(previous) {
        if (previous === 'transcribing') return 'ready-to-send'
        return 'idle'
      })
    }

    try {
      recognition.start()
    } catch {
      failed = true
      setVoiceState('failed')
      setVoiceErrorMessage(START_SPEECH_RECOGNITION_ERROR_MESSAGE)
    }
  }

  function stopListening() {
    const active = recognizerRef.current
    if (!active) {
      setVoiceState('idle')
      return
    }
    recognizerRef.current = null
    clearActiveHandlers(active)
    active.abort()
    setVoiceState('idle')
    setVoiceInterimTranscript('')
  }

  function resetVoice() {
    const active = recognizerRef.current
    if (active) {
      recognizerRef.current = null
      clearActiveHandlers(active)
      active.abort()
    }
    setVoiceState('idle')
    setVoiceErrorMessage(null)
    setVoiceInterimTranscript('')
  }

  return {
    voiceState,
    voiceErrorMessage,
    voiceSupported,
    voiceInterimTranscript,
    startListening,
    stopListening,
    resetVoice,
  }
}
