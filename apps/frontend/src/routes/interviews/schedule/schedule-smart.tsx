import { useReducer, useCallback, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateInterview } from '#/hooks/use-interviews'
import { useSubmitAvailability } from '#/hooks/use-submit-availability'
import { ScheduleDumb } from './schedule-dumb'
import {
  initialScheduleState,
  scheduleReducer,
  canAdvance,
  canGoBack,
  getVisibleSteps,
  isTimingComplete,
  isAvailabilityComplete,
  buildAiPayload,
  buildP2pPayload,
  getFieldErrors,
  type ScheduleStep,
  type FlowSlot,
} from './schedule-flow'
import type { InterviewType, InterviewMode } from '@mako/shared'

type SubmissionBranch = 'ai_led' | 'peer_to_peer'

const P2P_ACCEPTED_MESSAGE =
  'Availability submitted for matcher processing. Your interview will appear after matcher success.'

export function ScheduleSmart() {
  const navigate = useNavigate()
  const createInterview = useCreateInterview()
  const submitAvailability = useSubmitAvailability()

  const [state, dispatch] = useReducer(scheduleReducer, initialScheduleState)
  const [lastSubmissionBranch, setLastSubmissionBranch] =
    useState<SubmissionBranch | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const isDispatchingRef = useRef(false)

  const isSubmitting = createInterview.isPending || submitAvailability.isPending
  const mutationError =
    lastSubmissionBranch === 'peer_to_peer'
      ? submitAvailability.error?.message ?? null
      : lastSubmissionBranch === 'ai_led'
        ? createInterview.error?.message ?? null
        : null
  const errorMessage = state.validationError ?? mutationError
  const retryLabel =
    state.validationError === null && mutationError !== null
      ? lastSubmissionBranch === 'peer_to_peer'
        ? 'Retry submitting availability'
        : lastSubmissionBranch === 'ai_led'
          ? 'Retry scheduling'
          : null
      : null
  const fieldErrors = state.fieldErrors ?? getFieldErrors(state)

  const clearSubmissionFeedback = useCallback(function clearSubmissionFeedback() {
    setLastSubmissionBranch(null)
    setSuccessMessage(null)
  }, [])

  const handleSetType = useCallback(
    function handleSetType(type: InterviewType) {
      clearSubmissionFeedback()
      dispatch({ type: 'SET_TYPE', payload: type })
    },
    [clearSubmissionFeedback],
  )

  const handleSetMode = useCallback(
    function handleSetMode(mode: InterviewMode) {
      clearSubmissionFeedback()
      dispatch({ type: 'SET_MODE', payload: mode })
    },
    [clearSubmissionFeedback],
  )

  const handleSetScheduledAt = useCallback(
    function handleSetScheduledAt(value: 'now' | string) {
      clearSubmissionFeedback()
      dispatch({ type: 'SET_SCHEDULED_AT', payload: value })
    },
    [clearSubmissionFeedback],
  )

  const handleSetMaxMatches = useCallback(
    function handleSetMaxMatches(value: number) {
      clearSubmissionFeedback()
      dispatch({ type: 'SET_MAX_MATCHES', payload: value })
    },
    [clearSubmissionFeedback],
  )

  const handleSetSlots = useCallback(
    function handleSetSlots(slots: FlowSlot[]) {
      clearSubmissionFeedback()
      dispatch({ type: 'SET_SLOTS', payload: slots })
    },
    [clearSubmissionFeedback],
  )

  const handleNext = useCallback(
    function handleNext() {
      clearSubmissionFeedback()
      dispatch({ type: 'NEXT' })
    },
    [clearSubmissionFeedback],
  )

  const handleBack = useCallback(
    function handleBack() {
      clearSubmissionFeedback()
      dispatch({ type: 'BACK' })
    },
    [clearSubmissionFeedback],
  )

  const handleGoToStep = useCallback(
    function handleGoToStep(step: ScheduleStep) {
      clearSubmissionFeedback()
      dispatch({ type: 'GO_TO_STEP', payload: step })
    },
    [clearSubmissionFeedback],
  )

  const handleConfirm = useCallback(
    function handleConfirm() {
      if (isDispatchingRef.current) return

      dispatch({ type: 'SET_VALIDATION_ERROR', payload: null })
      dispatch({ type: 'SET_FIELD_ERRORS', payload: null })
      setSuccessMessage(null)

      if (state.mode === 'ai_led') {
        if (!isTimingComplete(state)) {
          dispatch({
            type: 'SET_VALIDATION_ERROR',
            payload: 'Please select a valid date and time.',
          })
          return
        }

        const payload = buildAiPayload(state)
        if (!payload) {
          dispatch({
            type: 'SET_VALIDATION_ERROR',
            payload: 'Unable to build interview payload.',
          })
          return
        }

        isDispatchingRef.current = true
        setLastSubmissionBranch('ai_led')
        createInterview.mutate(payload, {
          onSuccess: async function onCreateSuccess() {
            await navigate({ to: '/interviews' })
          },
          onSettled: function onCreateSettled() {
            isDispatchingRef.current = false
          },
        })
      } else if (state.mode === 'peer_to_peer') {
        if (!isAvailabilityComplete(state)) {
          dispatch({
            type: 'SET_VALIDATION_ERROR',
            payload:
              'Please provide at least one 60-minute slot and a positive max matches value.',
          })
          return
        }

        const payload = buildP2pPayload(state)
        if (!payload) {
          dispatch({
            type: 'SET_VALIDATION_ERROR',
            payload: 'Unable to build availability payload.',
          })
          return
        }

        isDispatchingRef.current = true
        setLastSubmissionBranch('peer_to_peer')
        submitAvailability.mutate(payload, {
          onSuccess: function onAvailabilitySuccess() {
            setSuccessMessage(P2P_ACCEPTED_MESSAGE)
          },
          onSettled: function onAvailabilitySettled() {
            isDispatchingRef.current = false
          },
        })
      }
    },
    [state, createInterview, submitAvailability, navigate],
  )

  const handleRetry = useCallback(
    function handleRetry() {
      handleConfirm()
    },
    [handleConfirm],
  )

  return (
    <ScheduleDumb
      step={state.step}
      visibleSteps={getVisibleSteps(state)}
      interviewType={state.interviewType}
      mode={state.mode}
      scheduledAt={state.scheduledAt}
      maxMatches={state.maxMatches}
      slots={state.slots}
      isSubmitting={isSubmitting}
      successMessage={successMessage}
      errorMessage={errorMessage}
      retryLabel={retryLabel}
      fieldErrors={fieldErrors}
      canAdvance={canAdvance(state)}
      canGoBack={canGoBack(state)}
      onSetType={handleSetType}
      onSetMode={handleSetMode}
      onSetScheduledAt={handleSetScheduledAt}
      onSetMaxMatches={handleSetMaxMatches}
      onSetSlots={handleSetSlots}
      onNext={handleNext}
      onBack={handleBack}
      onGoToStep={handleGoToStep}
      onConfirm={handleConfirm}
      onRetry={handleRetry}
    />
  )
}

export const Schedule = ScheduleSmart
