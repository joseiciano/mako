import { useEffect, useState } from 'react'
import type { ConsentDecision, InterviewDetail, RecordingConsentResponse, RecordingStatus } from '@mako/shared'
import {
  getRecordingConsentErrorMessage,
  RECORDING_CONSENT_COPY_VERSION,
  useSetRecordingConsent,
  useRevokeRecordingConsent,
} from '#/hooks/use-recording-consent'
import { RecordingConsentDumb } from './recording-consent-dumb'

export type RecordingConsentSmartProps = {
  interview: Pick<InterviewDetail, 'id' | 'mode' | 'status' | 'recording_status'>
}

export function RecordingConsentSmart(props: RecordingConsentSmartProps) {
  const [currentDecision, setCurrentDecision] = useState<ConsentDecision | null>(null)
  const [displayedRecordingStatus, setDisplayedRecordingStatus] = useState<RecordingStatus>(
    props.interview.recording_status,
  )

  const setConsent = useSetRecordingConsent()
  const revokeConsent = useRevokeRecordingConsent()

  useEffect(function syncRecordingStatus() {
    setDisplayedRecordingStatus(props.interview.recording_status)
  }, [props.interview.recording_status])

  const isSubmitting = setConsent.isPending || revokeConsent.isPending

  const mutationError = setConsent.error ?? revokeConsent.error
  const errorMessage = mutationError
    ? getRecordingConsentErrorMessage(mutationError)
    : null

  function handleChoose(decision: ConsentDecision) {
    setConsent.mutate(
      {
        id: props.interview.id,
        decision,
        consent_copy_version: RECORDING_CONSENT_COPY_VERSION,
      },
      {
        onSuccess: function onSetSuccess(data: RecordingConsentResponse) {
          setCurrentDecision(data.decision)
          setDisplayedRecordingStatus(data.recording_status)
        },
      },
    )
  }

  function handleRevoke() {
    revokeConsent.mutate(
      { id: props.interview.id },
      {
        onSuccess: function onRevokeSuccess(data: RecordingConsentResponse) {
          setCurrentDecision(null)
          setDisplayedRecordingStatus(data.recording_status)
        },
      },
    )
  }

  return (
    <RecordingConsentDumb
      currentDecision={currentDecision}
      errorMessage={errorMessage}
      interviewStatus={props.interview.status}
      isSubmitting={isSubmitting}
      mode={props.interview.mode}
      onChoose={handleChoose}
      onRevoke={handleRevoke}
      recordingStatus={displayedRecordingStatus}
    />
  )
}
