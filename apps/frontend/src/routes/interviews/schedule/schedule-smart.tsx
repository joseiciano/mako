import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateInterview } from '#/hooks/use-interviews'
import { useSubmitAvailability } from '#/hooks/use-submit-availability'
import { useAccount } from '#/hooks/use-account'
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
  getRetryLabel,
  classifyCreateFailure,
  restoreScheduleDraft,
  serializeScheduleDraft,
  shouldPersistScheduleDraft,
  SCHEDULE_DRAFT_STORAGE_KEY,
  PENDING_CREATE_GUARD_KEY,
  type ScheduleStep,
  type ScheduleState,
  type FlowSlot,
  type SubmissionBranch,
} from './schedule-flow'
import type { InterviewType, InterviewMode } from '@mako/shared'

const P2P_ACCEPTED_MESSAGE =
  'Availability submitted for matcher processing. Your interview will appear after matcher success.'

const AI_QUOTA_EXHAUSTED_MESSAGE =
  'You have no remaining free AI interviews or credits to start an AI interview. Add credits to continue.'

const AI_NOT_CONFIRMED_MESSAGE =
  'Your interview was not confirmed as created.'

const PENDING_CREATE_ALERT_MESSAGE =
  'We could not confirm whether your interview was created. Check your Interviews to avoid duplicates before trying again.'

function readPendingCreateGuard() {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(PENDING_CREATE_GUARD_KEY) === '1'
}

function writePendingCreateGuard() {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(PENDING_CREATE_GUARD_KEY, '1')
}

function clearPendingCreateGuard() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PENDING_CREATE_GUARD_KEY)
}

function readInitialScheduleState() {
  if (typeof window === 'undefined') return initialScheduleState

  const serialized = window.sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)
  const restored = restoreScheduleDraft(serialized)
  if (serialized !== null && restored === null) {
    window.sessionStorage.removeItem(SCHEDULE_DRAFT_STORAGE_KEY)
  }

  return restored ?? initialScheduleState
}

function clearScheduleDraft() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(SCHEDULE_DRAFT_STORAGE_KEY)
}

function writeScheduleDraft(state: ScheduleState) {
  if (typeof window === 'undefined') return

  if (!shouldPersistScheduleDraft(state)) {
    clearScheduleDraft()
    return
  }

  window.sessionStorage.setItem(SCHEDULE_DRAFT_STORAGE_KEY, serializeScheduleDraft(state))
}

export function ScheduleSmart() {
  const navigate = useNavigate()
  const createInterview = useCreateInterview()
  const submitAvailability = useSubmitAvailability()
  const account = useAccount()

  const [state, dispatch] = useReducer(
    scheduleReducer,
    initialScheduleState,
    readInitialScheduleState,
  )
  const [lastSubmissionBranch, setLastSubmissionBranch] =
    useState<SubmissionBranch | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [pendingCreateGuard, setPendingCreateGuard] = useState(readPendingCreateGuard)
  const [routingError, setRoutingError] = useState<string | null>(null)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const isDispatchingRef = useRef(false)

  const isSubmitting = createInterview.isPending || submitAvailability.isPending
  const mutationError =
    lastSubmissionBranch === 'peer_to_peer'
      ? submitAvailability.error?.message ?? null
      : lastSubmissionBranch === 'ai_led'
        ? createInterview.error?.message ?? null
        : null

  const isAiImmediate = state.mode === 'ai_led' && state.scheduledAt === 'now'
  const accountProfile = account.isSuccess && account.data ? account.data : null
  const aiImmediateExhausted =
    accountProfile !== null &&
    accountProfile.freeAiInterviews === 0 &&
    accountProfile.credits === 0
  const aiCreateBlocked = isAiImmediate && aiImmediateExhausted
  const policyNote = isAiImmediate
    ? 'Free AI interview quota is used first, then credits.'
    : null
  const exhaustedMessage = aiCreateBlocked ? AI_QUOTA_EXHAUSTED_MESSAGE : null

  const aiFailureKind =
    lastSubmissionBranch === 'ai_led'
      ? classifyCreateFailure(createInterview.error)
      : null
  const isAiRetryable = aiFailureKind === 'retryable_transport'

  const errorMessage =
    state.validationError ??
    (pendingCreateGuard
      ? null
      : aiFailureKind === 'retryable_transport'
        ? mutationError === null
          ? AI_NOT_CONFIRMED_MESSAGE
          : `${mutationError} ${AI_NOT_CONFIRMED_MESSAGE}`
        : mutationError)
  const retryLabel = getRetryLabel(
    state.validationError,
    mutationError,
    lastSubmissionBranch,
    lastSubmissionBranch === 'peer_to_peer' ? true : isAiRetryable,
  )
  const pendingCreateAlert = pendingCreateGuard ? PENDING_CREATE_ALERT_MESSAGE : null
  const fieldErrors = state.fieldErrors ?? getFieldErrors(state)
  const isP2pSubmissionAccepted =
    lastSubmissionBranch === 'peer_to_peer' && successMessage !== null

  useEffect(
    function persistScheduleDraft() {
      if (isP2pSubmissionAccepted) {
        clearScheduleDraft()
        return
      }

      writeScheduleDraft(state)
    },
    [state, isP2pSubmissionAccepted],
  )

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
      if (isDispatchingRef.current || isP2pSubmissionAccepted || routingError !== null) {
        return
      }
      if (pendingCreateGuard && isAiImmediate) return

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

        if (isAiImmediate && aiCreateBlocked) {
          dispatch({
            type: 'SET_VALIDATION_ERROR',
            payload: AI_QUOTA_EXHAUSTED_MESSAGE,
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
          onSuccess: async function onCreateSuccess(data) {
            clearPendingCreateGuard()
            setPendingCreateGuard(false)
            clearScheduleDraft()
            const interviewId = data.interview.id
            if (payload.scheduled_at === 'now' && interviewId) {
              try {
                await navigate({
                  to: '/interviews/$id/session',
                  params: { id: interviewId },
                })
              } catch {
                setPendingSessionId(interviewId)
                setRoutingError(
                  'Your session is ready, but we could not open it yet. It has not been provisioned or started. Open it again below.',
                )
              }
            } else {
              await navigate({ to: '/dashboard' })
            }
          },
          onError: function onCreateError(error) {
            const kind = classifyCreateFailure(error)
            if (kind === 'ambiguous_transport') {
              writePendingCreateGuard()
              setPendingCreateGuard(true)
            } else if (kind === 'client_rejection') {
              clearPendingCreateGuard()
              setPendingCreateGuard(false)
            }
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
            clearScheduleDraft()
            setSuccessMessage(P2P_ACCEPTED_MESSAGE)
          },
          onSettled: function onAvailabilitySettled() {
            isDispatchingRef.current = false
          },
        })
      }
    },
    [
      state,
      createInterview,
      submitAvailability,
      navigate,
      isP2pSubmissionAccepted,
      pendingCreateGuard,
      isAiImmediate,
      aiCreateBlocked,
      routingError,
    ],
  )

  const handleRetry = useCallback(
    function handleRetry() {
      handleConfirm()
    },
    [handleConfirm],
  )

  const handleRetryRouting = useCallback(
    async function handleRetryRouting() {
      if (!pendingSessionId) return

      try {
        await navigate({
          to: '/interviews/$id/session',
          params: { id: pendingSessionId },
        })
      } catch {
        // Keep the routing error visible so the user can attempt again.
      }
    },
    [pendingSessionId, navigate],
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
      routingError={routingError}
      retryLabel={retryLabel}
      policyNote={policyNote}
      createBlocked={aiCreateBlocked || (pendingCreateGuard && isAiImmediate)}
      createBlockedMessage={exhaustedMessage}
      pendingCreateAlert={pendingCreateAlert}
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
      onRetryRouting={handleRetryRouting}
    />
  )
}

export const Schedule = ScheduleSmart
