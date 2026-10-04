import { useState } from 'react'
import { useAccount, useCompanies } from '../../../hooks/use-account'
import {
  useInterviewerStatus,
  useSubmitInterviewerApplication,
} from '../../../hooks/use-interviewer-application'
import { ApiError } from '../../../lib/http-transport'
import { ApplicationFormDumb } from './application-form-dumb'
import { ApplicationStatusDumb } from './application-status-dumb'

const MAX_SELECTIONS = 10
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const pageClassName = 'mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-14'

export function InterviewerApplicationSmart() {
  const accountQuery = useAccount()
  const statusQuery = useInterviewerStatus()
  const companiesQuery = useCompanies()
  const submitMutation = useSubmitInterviewerApplication()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [emailDraft, setEmailDraft] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [focusErrorToken, setFocusErrorToken] = useState(0)

  const email = emailDraft ?? accountQuery.data?.email ?? ''
  const records = companiesQuery.data ?? []

  function failSubmit(errors: {
    email?: string | null
    selection?: string | null
    submit?: string | null
  }) {
    setEmailError(errors.email ?? null)
    setSelectionError(errors.selection ?? null)
    setSubmitError(errors.submit ?? null)
    setFocusErrorToken(function increment(token) {
      return token + 1
    })
  }

  function handleToggleRecord(recordId: string) {
    if (submitMutation.isPending) return

    setSelectionError(null)
    setSelectedIds(function toggle(current) {
      return current.includes(recordId)
        ? current.filter(function keep(id) {
            return id !== recordId
          })
        : [...current, recordId]
    })
  }

  function handleEmailChange(next: string) {
    setEmailError(null)
    setEmailDraft(next)
  }

  async function handleSubmit() {
    if (submitMutation.isPending) return

    // Preserve profile list order, and drop any selection that is no longer complete.
    const employmentRecordIds = records
      .filter(function isSelectable(record) {
        return record.isComplete && selectedIds.includes(record.id)
      })
      .map(function toId(record) {
        return record.id
      })
    const trimmedEmail = email.trim()

    const emailMessage = emailPattern.test(trimmedEmail) ? null : 'Enter a valid contact email.'
    let selectionMessage: string | null = null
    if (employmentRecordIds.length < 1) {
      selectionMessage = 'Select at least one employment record.'
    } else if (employmentRecordIds.length > MAX_SELECTIONS) {
      selectionMessage = `Select no more than ${MAX_SELECTIONS} employment records.`
    }

    if (emailMessage || selectionMessage) {
      failSubmit({ email: emailMessage, selection: selectionMessage })
      return
    }

    setEmailError(null)
    setSelectionError(null)
    setSubmitError(null)

    try {
      await submitMutation.mutateAsync({ email: trimmedEmail, employmentRecordIds })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Another request already created an application; converge on canonical status.
        const refreshed = await statusQuery.refetch()
        const canonical = refreshed.data
        if (canonical && canonical.status !== 'rejected') {
          return
        }
      }

      failSubmit({
        submit: error instanceof Error ? error.message : 'Unable to submit interviewer application.',
      })
    }
  }

  if (statusQuery.isLoading) {
    return (
      <main className={pageClassName} aria-busy="true">
        <p className="text-slate-400">Loading application status...</p>
      </main>
    )
  }

  if (statusQuery.isError) {
    return (
      <main className={pageClassName}>
        <p role="alert" className="text-red-300">
          {statusQuery.error.message}
        </p>
        <button
          type="button"
          onClick={function retry() {
            void statusQuery.refetch()
          }}
          className="self-start text-sm text-blue-400 underline"
        >
          Retry
        </button>
      </main>
    )
  }

  const application = statusQuery.data ?? null
  const blocksSubmission = application !== null && application.status !== 'rejected'

  return (
    <main className={pageClassName}>
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs uppercase tracking-wide text-slate-400">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Interviewer Application</h1>
        <p className="mt-2 text-sm text-slate-300">
          Apply to become a verified interviewer. Approval grants account-level eligibility.
        </p>
      </section>

      {application && <ApplicationStatusDumb application={application} />}

      {!blocksSubmission && (
        <ApplicationFormDumb
          records={records}
          isLoadingRecords={companiesQuery.isLoading}
          recordsError={companiesQuery.error ? companiesQuery.error.message : null}
          onRetryRecords={function retryRecords() {
            void companiesQuery.refetch()
          }}
          selectedIds={selectedIds}
          email={email}
          emailError={emailError}
          selectionError={selectionError}
          submitError={submitError}
          isSubmitting={submitMutation.isPending}
          isReapplication={application?.status === 'rejected'}
          focusErrorToken={focusErrorToken}
          onToggleRecord={handleToggleRecord}
          onEmailChange={handleEmailChange}
          onSubmit={handleSubmit}
        />
      )}
    </main>
  )
}

export const InterviewerApplication = InterviewerApplicationSmart
