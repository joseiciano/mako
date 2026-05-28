import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateInterview } from '#/hooks/use-interviews'
import { ScheduleDumb } from './schedule-dumb'

export function ScheduleSmart() {
  const navigate = useNavigate()
  const createInterview = useCreateInterview()
  const [scheduledAt, setScheduledAt] = useState<string>('now')
  const [validationError, setValidationError] = useState<string | null>(null)

  const isSubmitting = createInterview.isPending
  const errorMessage = validationError ?? createInterview.error?.message ?? null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidationError(null)

    if (scheduledAt !== 'now') {
      const parsed = new Date(scheduledAt)
      if (scheduledAt === '' || Number.isNaN(parsed.valueOf())) {
        setValidationError('Please select a valid date and time.')
        return
      }
    }

    const scheduledAtValue =
      scheduledAt === 'now'
        ? ('now' as const)
        : new Date(scheduledAt).toISOString()

    const payload = {
      type: 'system_design' as const,
      mode: 'ai_led' as const,
      scheduled_at: scheduledAtValue,
    }

    createInterview.mutate(payload, {
      onSuccess: async function onCreateSuccess() {
        await navigate({ to: '/interviews' })
      },
    })
  }

  return (
    <ScheduleDumb
      scheduledAt={scheduledAt}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
      onScheduledAtChange={setScheduledAt}
      onSubmit={handleSubmit}
    />
  )
}

export const Schedule = ScheduleSmart
