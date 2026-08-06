import { useEffect, useReducer, useRef } from 'react'
import { useAIChat, type SubmitAiChatParams } from '#/hooks/use-interviews'
import { getWhiteboardSceneSnapshot } from '#/components/interviews/whiteboard'
import type { WhiteboardProvisionHandle } from '#/components/interviews/whiteboard'
import type { WhiteboardSceneSnapshot } from '#/components/interviews/whiteboard'
import type { AIChatDumbProps } from './ai-chat-types'
import { AIChatDumb } from './ai-chat-dumb'
import { useAIChatSpeech } from './use-ai-chat-speech'
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
  const speech = useAIChatSpeech({
    onFinalTranscript: function handleFinalTranscript(transcript) {
      dispatch({
        type: 'INPUT_CHANGED',
        payload: appendRecognizedText(state.inputValue, transcript),
      })
    },
  })

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

    aiChatMutation.mutate(params, {
      onSuccess: function onAiChatSuccess(response) {
        if (!isMountedRef.current) return
        dispatch({
          type: input.isRetry ? 'RETRY_SUCCEEDED' : 'SUBMIT_SUCCEEDED',
          payload: response.reply,
        })
      },
      onError: function onAiChatError() {
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
    if (trimmed.length === 0 || state.submitState === 'sending') return

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
    speech.resetVoice()
    runMutation(input, snapshot)
  }

  function handleRetry() {
    if (
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
  }

  return <AIChatDumb {...dumbProps} />
}

function appendRecognizedText(current: string, transcript: string): string {
  const trimmed = current.trim()
  if (trimmed.length === 0) return transcript
  return `${trimmed} ${transcript}`
}
