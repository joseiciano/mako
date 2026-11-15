import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount, useCompanies } from '../../../hooks/use-account'
import {
  fetchInterviewerStatus,
  interviewerStatusQueryKey,
  useInterviewerStatus,
  useSubmitInterviewerApplication,
} from '../../../hooks/use-interviewer-application'
import { ApiError } from '../../../lib/http-transport'
import { ApplicationFormDumb } from './application-form-dumb'
import { ApplicationStatusDumb } from './application-status-dumb'
import { validateApplication, type ApplicationFormErrors } from './validate-application'

export function InterviewerApplicationSmart() {
  const queryClient = useQueryClient()
  const statusQuery = useInterviewerStatus()
  const companiesQuery = useCompanies()
  const accountQuery = useAccount()
  const submitMutation = useSubmitInterviewerApplication()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [emailOverride, setEmailOverride] = useState<string | null>(null)
  const [errors, setErrors] = useState<ApplicationFormErrors>({})
  const [isResolvingConflict, setIsResolvingConflict] = useState(false)
  const [errorFocusKey, setErrorFocusKey] = useState(0)

  const email = emailOverride ?? accountQuery.data?.email ?? ''
  const records = companiesQuery.data ?? []

  function showErrors(nextErrors: ApplicationFormErrors) {
    setErrors(nextErrors)
    setErrorFocusKey(function bump(key) {
      return key + 1
    })
  }

  function handleToggleRecord(id: string) {
    setSelectedIds(function toggle(ids) {
      return ids.includes(id) ? ids.filter(function keep(x) { return x !== id }) : [...ids, id]
    })
  }

  async function handleSubmit() {
    const employmentRecordIds = records
      .filter(function isSelected(record) {
        return record.isComplete && selectedIds.includes(record.id)
      })
      .map(function toId(record) {
        return record.id
      })
    const trimmedEmail = email.trim()
    const validationErrors = validateApplication(trimmedEmail, employmentRecordIds)

    if (validationErrors.email || validationErrors.selection) {
      showErrors(validationErrors)
      return
    }

    setErrors({})
    try {
      await submitMutation.mutateAsync({ email: trimmedEmail, employmentRecordIds })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setIsResolvingConflict(true)
        try {
          const refetched = await fetchInterviewerStatus()
          queryClient.setQueryData(interviewerStatusQueryKey, refetched)
          if (refetched && (refetched.status === 'pending' || refetched.status === 'approved')) {
            return
          }
        } catch {
          // fall through to the error message below
        } finally {
          setIsResolvingConflict(false)
        }
        showErrors({
          submit: 'An application already exists, but its status could not be confirmed. Try again.',
        })
        return
      }
      showErrors({ submit: readSubmitError(error) })
    }
  }

  const application = statusQuery.data

  return (
    <section className="flex flex-col gap-6" aria-busy={statusQuery.isLoading}>
      <h2 className="text-2xl font-semibold text-white">Become a verified interviewer</h2>
      {renderBody()}
    </section>
  )

  function renderBody() {
    if (statusQuery.isLoading) {
      return <p role="status" className="text-slate-400">Loading application status...</p>
    }

    if (statusQuery.isError) {
      return (
        <div role="alert" className="text-red-300">
          <p>{statusQuery.error.message}</p>
          <button
            type="button"
            onClick={function retry() {
              void statusQuery.refetch()
            }}
            className="mt-2 text-sm text-blue-400 hover:underline"
          >
            Try again
          </button>
        </div>
      )
    }

    if (application && application.status !== 'rejected') {
      return <ApplicationStatusDumb application={application} />
    }

    return (
      <>
        {application && <ApplicationStatusDumb application={application} />}
        {renderForm()}
      </>
    )
  }

  function renderForm() {
    if (companiesQuery.isLoading) {
      return <p role="status" className="text-slate-400">Loading employment history...</p>
    }

    if (companiesQuery.isError) {
      return (
        <div role="alert" className="text-red-300">
          <p>{companiesQuery.error.message}</p>
          <button
            type="button"
            onClick={function retry() {
              void companiesQuery.refetch()
            }}
            className="mt-2 text-sm text-blue-400 hover:underline"
          >
            Try again
          </button>
        </div>
      )
    }

    return (
      <ApplicationFormDumb
        records={records}
        selectedIds={selectedIds}
        email={email}
        isSubmitting={submitMutation.isPending || isResolvingConflict}
        errors={errors}
        errorFocusKey={errorFocusKey}
        onToggleRecord={handleToggleRecord}
        onEmailChange={setEmailOverride}
        onSubmit={handleSubmit}
      />
    )
  }
}

function readSubmitError(error: unknown): string {
  if (error instanceof Error && error.name !== 'ZodError') return error.message
  return 'Unable to submit application.'
}
