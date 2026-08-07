import { useEffect, useReducer, useRef } from 'react'
import { useAIChat, type SubmitAiChatParams } from '#/hooks/use-interviews'
import { getWhiteboardSceneSnapshot } from '#/components/interviews/whiteboard'
import type { WhiteboardProvisionHandle } from '#/components/interviews/whiteboard'
import type { WhiteboardSceneSnapshot } from '#/components/interviews/whiteboard'
import type { AIChatDumbProps } from './ai-chat-types'
import { AIChatDumb } from './ai-chat-dumb'
import { useAIChatSpeech } from './use-ai-chat-speech'
import { useAIChatSynthesis } from './use-ai-chat-synthesis'
import {
  aiChatPanelReducer,
  buildChatHistory,
  hasReachedRetryLimit,
  initialAIChatPanelState,
} from './ai-chat-flow'

const SUBMIT_AI_CHAT_ERROR_MESSAGE =
  'Unable to get an AI response. Your message was not lost — you can retry.'

const WHITEBOARD_UNAVAILABLE_MESSAGE =
  'Your whiteboard is still loading. Finish connecting to the session, then try again.'

type AIChatSubmitInput = {
  id: string
  message: string
  isRetry: boolean
  chatHistory: ReturnType<typeof buildChatHistory>
}

export type AIChatSmartProps = {
  interviewId: string
  whiteboardProvisionHandle: WhiteboardProvisionHandle | null
}

export function AIChatSmart({
  interviewId,
  whiteboardProvisionHandle,
}: AIChatSmartProps) {
  const [state, dispatch] = useReducer(aiChatPanelReducer, initialAIChatPanelState)
  const aiChatMutation = useAIChat()
  const isMountedRef = useRef(true)
  // Guards against overlapping in-flight mutations from repeated taps, stale
  // recognition callbacks, or racing send/retry actions. The UI also disables
  // the send control while sending, but the ref closes the remaining window
  // between dispatches.
  const submissionInFlightRef = useRef(false)
  // Monotonic identity for the most recent submit/retry request. Callbacks that
  // capture an older token belong to a completed or replaced request and are
  // ignored entirely: they cannot clear the in-flight guard, dispatch reducer
  // actions, or start playback for a newer request.
  const submissionRequestIdRef = useRef(0)
  const speech = useAIChatSpeech({
    onFinalTranscript: function handleFinalTranscript(transcript) {
      dispatch({
        type: 'INPUT_CHANGED',
        payload: appendRecognizedText(state.inputValue, transcript),
      })
    },
  })
  const synthesis = useAIChatSynthesis()

  useEffect(
    function trackMount() {
      isMountedRef.current = true
      return function cleanup() {
        isMountedRef.current = false
      }
    },
    [],
  )

  function runMutation(input: AIChatSubmitInput, snapshot: WhiteboardSceneSnapshot) {
    const params: SubmitAiChatParams = {
      id: input.id,
      message: input.message,
      canvas_snapshot: snapshot,
      guidance_mode: 'review',
      chat_history: input.chatHistory.length > 0 ? input.chatHistory : undefined,
    }

    // Each request bumps the monotonic token. Any callback that fires under an
    // older token belongs to a superseded request and must be a no-op.
    const requestId = ++submissionRequestIdRef.current

    aiChatMutation.mutate(params, {
      onSuccess: function onAiChatSuccess(response) {
        if (requestId !== submissionRequestIdRef.current) return
        submissionInFlightRef.current = false
        if (!isMountedRef.current) return
        dispatch({
          type: input.isRetry ? 'RETRY_SUCCEEDED' : 'SUBMIT_SUCCEEDED',
          payload: response.reply,
        })
        // Audible playback is anchored to the exact reply content already
        // rendered in the chat UI; no separate reply text is generated.
        synthesis.playReply(response.reply)
      },
      onError: function onAiChatError() {
        if (requestId !== submissionRequestIdRef.current) return
        submissionInFlightRef.current = false
        if (!isMountedRef.current) return
        dispatch({
          type: input.isRetry ? 'RETRY_FAILED' : 'SUBMIT_FAILED',
          payload: SUBMIT_AI_CHAT_ERROR_MESSAGE,
        })
      },
    })
  }

  function handleSubmit() {
    const trimmed = state.inputValue.trim()
    if (submissionInFlightRef.current || state.submitState === 'sending') return
    if (trimmed.length === 0) return

    const snapshot = getWhiteboardSceneSnapshot(whiteboardProvisionHandle)
    if (!snapshot) {
      // Keep the typed message in the input; do not mark a stale message as
      // failed or offer retry. The user can resend once the whiteboard is ready.
      dispatch({ type: 'SUBMIT_REJECTED', payload: WHITEBOARD_UNAVAILABLE_MESSAGE })
      return
    }

    const input: AIChatSubmitInput = {
      id: interviewId,
      message: trimmed,
      isRetry: false,
      chatHistory: buildChatHistory(state.messages),
    }

    dispatch({ type: 'SUBMIT_STARTED', payload: trimmed })
    submissionInFlightRef.current = true
    // A new turn supersedes any in-flight reply audio so playback never blocks
    // typed or voice follow-up turns.
    synthesis.stopPlayback()
    speech.resetVoice()
    runMutation(input, snapshot)
  }

  function handleRetry() {
    if (
      submissionInFlightRef.current ||
      state.submitState === 'sending' ||
      !state.lastFailedMessageContent ||
      hasReachedRetryLimit(state)
    ) {
      return
    }

    const snapshot = getWhiteboardSceneSnapshot(whiteboardProvisionHandle)
    if (!snapshot) {
      dispatch({ type: 'RETRY_FAILED', payload: WHITEBOARD_UNAVAILABLE_MESSAGE })
      return
    }

    const input: AIChatSubmitInput = {
      id: interviewId,
      message: state.lastFailedMessageContent,
      isRetry: true,
      chatHistory: buildChatHistory(state.messages),
    }

    dispatch({ type: 'RETRY_STARTED' })
    submissionInFlightRef.current = true
    synthesis.stopPlayback()
    runMutation(input, snapshot)
  }

  function handleInputChange(value: string) {
    dispatch({ type: 'INPUT_CHANGED', payload: value })
  }

  function handleVoiceToggle() {
    if (state.submitState === 'sending') return
    if (speech.voiceState === 'listening') {
      speech.stopListening()
    } else {
      // Starting to listen should not overlap with reply playback: silence the
      // audio so voice input and playback never create ambiguous runtime state.
      synthesis.stopPlayback()
      speech.startListening()
    }
  }

  const dumbProps: AIChatDumbProps = {
    canRetry:
      state.lastFailedMessageContent !== null && !hasReachedRetryLimit(state),
    retryLimitReached: hasReachedRetryLimit(state) && state.lastFailedMessageContent !== null,
    disabled: state.submitState === 'sending',
    errorMessage: state.errorMessage,
    inputValue: state.inputValue,
    messages: state.messages,
    onInputChange: handleInputChange,
    onRetry: handleRetry,
    onSubmit: handleSubmit,
    submitState: state.submitState,
    voiceState: speech.voiceState,
    voiceErrorMessage: speech.voiceErrorMessage,
    voiceSupported: speech.voiceSupported,
    voiceInterimTranscript: speech.voiceInterimTranscript,
    onVoiceToggle: handleVoiceToggle,
    playbackState: synthesis.playbackState,
    playbackSupported: synthesis.playbackSupported,
    playbackMuted: synthesis.playbackMuted,
    canReplay: synthesis.canReplay,
    playbackErrorMessage: synthesis.playbackErrorMessage,
    onReplay: synthesis.replay,
    onStopPlayback: synthesis.stopPlayback,
    onToggleMuted: synthesis.toggleMuted,
  }

  return <AIChatDumb {...dumbProps} />
}

function appendRecognizedText(current: string, transcript: string): string {
  const trimmed = current.trim()
  if (trimmed.length === 0) return transcript
  return `${trimmed} ${transcript}`
}
