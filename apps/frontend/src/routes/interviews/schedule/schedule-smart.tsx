import { useReducer, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateInterview } from '#/hooks/use-interviews'
import { useSubmitAvailability } from '#/hooks/use-submit-availability'
import { useAccount } from '#/hooks/use-account'
import { ScheduleDumb } from './schedule-dumb'
import { PremiumMarketplaceSmart } from './premium-marketplace-smart'
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
  getSubmissionBranch,
  PENDING_CREATE_GUARD_KEY,
  type CreateFailureKind,
  type ScheduleStep,
  type ScheduleState,
  type FlowSlot,
  type SubmissionBranch,
  type ScheduleSubmissionBranch,
} from './schedule-flow'
import {
  clearScheduleDraftStorage,
  persistScheduleDraft,
  readScheduleDraftV2,
  restoreScheduleDraftWithMigration,
} from './schedule-draft-storage'
import type { InterviewType } from '@mako/shared'

const P2P_ACCEPTED_MESSAGE =
  'Availability submitted for matcher processing. Your interview will appear after matcher success.'

const AI_QUOTA_EXHAUSTED_MESSAGE =
  'You have no remaining free AI interviews or credits to start an AI interview. Add credits to continue.'

const AI_NOT_CONFIRMED_MESSAGE =
  'Your interview was not confirmed as created.'

const PENDING_CREATE_ALERT_MESSAGE =
  'We could not confirm whether your interview was created. Check your Interviews to avoid duplicates before trying again.'

function getSubmissionMutationError(
  lastSubmissionBranch: SubmissionBranch | null,
  availabilityError: Error | null,
  createError: Error | null,
): string | null {
  if (lastSubmissionBranch === 'peer_to_peer') {
    return availabilityError?.message ?? null
  }

  if (lastSubmissionBranch === 'ai_led') {
    return createError?.message ?? null
  }

  return null
}

function buildErrorMessage(
  validationError: string | null,
  pendingCreateGuard: boolean,
  aiFailureKind: CreateFailureKind | null,
  mutationError: string | null,
): string | null {
  if (validationError !== null) return validationError
  if (pendingCreateGuard) return null

  if (aiFailureKind === 'retryable_transport') {
    return mutationError === null
      ? AI_NOT_CONFIRMED_MESSAGE
      : `${mutationError} ${AI_NOT_CONFIRMED_MESSAGE}`
  }

  return mutationError
}

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

function readInitialSchedulingState(): {
  state: ScheduleState
  submissionBranch: ScheduleSubmissionBranch
} {
  if (typeof window === 'undefined') {
    return { state: initialScheduleState, submissionBranch: 'pre_branch' }
  }

  const envelope = readScheduleDraftV2()
  if (envelope !== null && envelope.branch === 'verified_interviewer') {
    return { state: initialScheduleState, submissionBranch: 'verified_interviewer' }
  }

  const restored = restoreScheduleDraftWithMigration()
  if (restored === null) {
    return { state: initialScheduleState, submissionBranch: 'pre_branch' }
  }

  return { state: restored, submissionBranch: getSubmissionBranch(restored) }
}

export function ScheduleSmart() {
  const navigate = useNavigate()
  const createInterview = useCreateInterview()
  const submitAvailability = useSubmitAvailability()
  const account = useAccount()

  const [initialScheduling] = useState(readInitialSchedulingState)
  const [state, dispatch] = useReducer(
    scheduleReducer,
    initialScheduling.state,
  )
  const [submissionBranch, setSubmissionBranch] =
    useState<ScheduleSubmissionBranch>(initialScheduling.submissionBranch)
  const [lastSubmissionBranch, setLastSubmissionBranch] =
    useState<SubmissionBranch | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [pendingCreateGuard, setPendingCreateGuard] = useState(readPendingCreateGuard)
  const [routingError, setRoutingError] = useState<string | null>(null)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const isDispatchingRef = useRef(false)

  const isSubmitting = createInterview.isPending || submitAvailability.isPending
  const mutationError = getSubmissionMutationError(
    lastSubmissionBranch,
    submitAvailability.error,
    createInterview.error,
  )

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

  const errorMessage = buildErrorMessage(
    state.validationError,
    pendingCreateGuard,
    aiFailureKind,
    mutationError,
  )
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
    function persistScheduleDraftEffect() {
      if (submissionBranch === 'verified_interviewer') return

      if (isP2pSubmissionAccepted) {
        clearScheduleDraftStorage()
        return
      }

      persistScheduleDraft(state)
    },
    [state, isP2pSubmissionAccepted, submissionBranch],
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

  const handleSelectBranch = useCallback(
    function handleSelectBranch(branch: ScheduleSubmissionBranch) {
      clearSubmissionFeedback()

      if (branch === 'verified_interviewer') {
        clearScheduleDraftStorage()
        setSubmissionBranch('verified_interviewer')
        return
      }

      dispatch({
        type: 'SET_MODE',
        payload: branch === 'ai_direct' ? 'ai_led' : 'peer_to_peer',
      })
      setSubmissionBranch(branch)
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
            clearScheduleDraftStorage()
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
            clearScheduleDraftStorage()
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

  if (submissionBranch === 'verified_interviewer') {
    return <PremiumMarketplaceSmart />
  }

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
      onSelectBranch={handleSelectBranch}
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
