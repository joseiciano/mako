import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount, useCompanies } from '../../../hooks/use-account'
import {
  interviewerStatusQueryKey,
  useInterviewerStatus,
  useSubmitInterviewerApplication,
} from '../../../hooks/use-interviewer-application'
import { ApiError } from '../../../lib/http-transport'
import { ApplicationFormDumb, type ApplicationFormErrors } from './application-form-dumb'
import { ApplicationStatusDumb } from './application-status-dumb'
import { validateApplication } from './validate-application'

export function InterviewerApplicationSmart() {
  const queryClient = useQueryClient()
  const statusQuery = useInterviewerStatus()
  const companiesQuery = useCompanies()
  const accountQuery = useAccount()
  const submitMutation = useSubmitInterviewerApplication()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [emailOverride, setEmailOverride] = useState<string | null>(null)
  const [errors, setErrors] = useState<ApplicationFormErrors>({})
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
        await queryClient.invalidateQueries({ queryKey: interviewerStatusQueryKey })
        const canonical = queryClient.getQueryData(interviewerStatusQueryKey)
        if (canonical) return
      }
      showErrors({
        submit: error instanceof Error ? error.message : 'Unable to submit application.',
      })
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
        isSubmitting={submitMutation.isPending}
        errors={errors}
        errorFocusKey={errorFocusKey}
        onToggleRecord={handleToggleRecord}
        onEmailChange={setEmailOverride}
        onSubmit={handleSubmit}
      />
    )
  }
}
