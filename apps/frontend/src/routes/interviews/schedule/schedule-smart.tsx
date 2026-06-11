import { useReducer, useCallback } from 'react'
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
  type ScheduleStep,
  type FlowSlot,
} from './schedule-flow'
import type { InterviewType, InterviewMode } from '@mako/shared'

export function ScheduleSmart() {
  const navigate = useNavigate()
  const createInterview = useCreateInterview()
  const submitAvailability = useSubmitAvailability()

  const [state, dispatch] = useReducer(scheduleReducer, initialScheduleState)

  const isSubmitting = createInterview.isPending || submitAvailability.isPending
  const mutationError =
    createInterview.error?.message ?? submitAvailability.error?.message ?? null
  const errorMessage = state.validationError ?? mutationError

  const handleSetType = useCallback(function handleSetType(type: InterviewType) {
    dispatch({ type: 'SET_TYPE', payload: type })
  }, [])

  const handleSetMode = useCallback(function handleSetMode(mode: InterviewMode) {
    dispatch({ type: 'SET_MODE', payload: mode })
  }, [])

  const handleSetScheduledAt = useCallback(
    function handleSetScheduledAt(value: 'now' | string) {
      dispatch({ type: 'SET_SCHEDULED_AT', payload: value })
    },
    [],
  )

  const handleSetMaxMatches = useCallback(
    function handleSetMaxMatches(value: number) {
      dispatch({ type: 'SET_MAX_MATCHES', payload: value })
    },
    [],
  )

  const handleSetSlots = useCallback(function handleSetSlots(slots: FlowSlot[]) {
    dispatch({ type: 'SET_SLOTS', payload: slots })
  }, [])

  const handleNext = useCallback(function handleNext() {
    dispatch({ type: 'NEXT' })
  }, [])

  const handleBack = useCallback(function handleBack() {
    dispatch({ type: 'BACK' })
  }, [])

  const handleGoToStep = useCallback(function handleGoToStep(step: ScheduleStep) {
    dispatch({ type: 'GO_TO_STEP', payload: step })
  }, [])

  const handleConfirm = useCallback(
    function handleConfirm() {
      dispatch({ type: 'SET_VALIDATION_ERROR', payload: null })

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

        createInterview.mutate(payload, {
          onSuccess: async function onCreateSuccess() {
            await navigate({ to: '/interviews' })
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

        submitAvailability.mutate(payload, {
          onSuccess: async function onSubmitSuccess() {
            await navigate({ to: '/interviews' })
          },
        })
      }
    },
    [state, createInterview, submitAvailability, navigate],
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
      errorMessage={errorMessage}
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
    />
  )
}

export const Schedule = ScheduleSmart
