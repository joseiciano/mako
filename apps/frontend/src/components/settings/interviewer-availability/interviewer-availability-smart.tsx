import { useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAccount } from '../../../hooks/use-account'
import {
  useCancelPremiumSlot,
  usePremiumSlots,
  usePublishPremiumSlot,
} from '../../../hooks/use-premium-availability'
import { PublishFormDumb } from './publish-form-dumb'
import { SlotListDumb } from './slot-list-dumb'

export function InterviewerAvailabilitySmart() {
  const accountQuery = useAccount()
  const slotsQuery = usePremiumSlots()
  const publishMutation = usePublishPremiumSlot()
  const cancelMutation = useCancelPremiumSlot()
  const [publishError, setPublishError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  if (accountQuery.isLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-14">
        <p className="text-slate-400">Loading...</p>
      </main>
    )
  }

  if (accountQuery.data && !accountQuery.data.isVerifiedInterviewer) {
    return <Navigate to="/settings" />
  }

  const policy = slotsQuery.data?.policy
  const leadTimeMinutes = policy?.leadTimeMinutes ?? 60
  const horizonDays = policy?.horizonDays ?? 90

  async function handlePublish(startTime: string) {
    setPublishError(null)
    try {
      const isoStartTime = new Date(startTime).toISOString()
      await publishMutation.mutateAsync({
        interviewType: 'system_design',
        startTime: isoStartTime,
      })
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Unable to publish premium slot.')
    }
  }

  async function handleCancel(slotId: string) {
    setCancelError(null)
    try {
      await cancelMutation.mutateAsync(slotId)
    } catch (error) {
      setCancelError(
        error instanceof Error ? error.message : 'Unable to cancel premium slot.',
      )
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-14">
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs uppercase tracking-wide text-slate-400">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Interviewer Availability</h1>
        <p className="mt-2 text-sm text-slate-300">
          Publish and manage your premium system design interview slots.
        </p>
      </section>

      <PublishFormDumb
        isLoading={publishMutation.isPending}
        error={publishError}
        leadTimeMinutes={leadTimeMinutes}
        horizonDays={horizonDays}
        onSubmit={handlePublish}
      />

      <SlotListDumb
        slots={slotsQuery.data?.slots ?? []}
        isLoading={slotsQuery.isLoading}
        error={slotsQuery.error ? slotsQuery.error.message : null}
        onRetry={slotsQuery.refetch}
        cancelSlotId={cancelMutation.isPending ? cancelMutation.variables : null}
        cancelError={cancelError}
        onCancel={handleCancel}
      />
    </main>
  )
}

export const InterviewerAvailability = InterviewerAvailabilitySmart
