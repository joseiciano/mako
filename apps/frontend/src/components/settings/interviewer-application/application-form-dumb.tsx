import { useEffect, useRef, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import type { EmploymentRecordCompatibilityResponse } from '@mako/shared'
import { formatDateRange } from '../../profile/company-list/company-list-dumb'

export type ApplicationFormDumbProps = {
  records: EmploymentRecordCompatibilityResponse[]
  isLoadingRecords: boolean
  recordsError: string | null
  onRetryRecords: () => void
  selectedIds: string[]
  email: string
  emailError: string | null
  selectionError: string | null
  submitError: string | null
  isSubmitting: boolean
  isReapplication: boolean
  // Incremented by the smart component after a failed submit to move focus.
  focusErrorToken: number
  onToggleRecord: (recordId: string) => void
  onEmailChange: (email: string) => void
  onSubmit: () => void
}

const errorClassName = 'text-sm text-red-300'

export function ApplicationFormDumb(props: ApplicationFormDumbProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  const selectionErrorRef = useRef<HTMLParagraphElement>(null)
  const submitErrorRef = useRef<HTMLParagraphElement>(null)

  useEffect(
    function focusFirstActionableError() {
      if (props.focusErrorToken === 0) return

      if (props.emailError) {
        emailRef.current?.focus()
      } else if (props.selectionError) {
        selectionErrorRef.current?.focus()
      } else if (props.submitError) {
        submitErrorRef.current?.focus()
      }
    },
    // Only re-run when the smart component signals a new failed submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.focusErrorToken],
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (props.isSubmitting) return
    props.onSubmit()
  }

  const selectedCount = props.selectedIds.length
  const hasNoRecords = !props.isLoadingRecords && !props.recordsError && props.records.length === 0

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={props.isSubmitting}
      noValidate
      className="flex flex-col gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6"
    >
      <div>
        <h2 className="text-xl font-semibold text-white">
          {props.isReapplication ? 'Reapply as a verified interviewer' : 'Apply as a verified interviewer'}
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Select the employment records you want reviewed. Their details are copied into your
          application for review and will not change if you edit your profile later.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="interviewer-contact-email" className="text-sm font-medium text-slate-200">
          Contact email
        </label>
        <input
          id="interviewer-contact-email"
          ref={emailRef}
          type="email"
          value={props.email}
          disabled={props.isSubmitting}
          onChange={function handleChange(event) {
            props.onEmailChange(event.target.value)
          }}
          aria-invalid={props.emailError ? true : undefined}
          aria-describedby={props.emailError ? 'interviewer-email-error' : undefined}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
        {props.emailError && (
          <p id="interviewer-email-error" role="alert" className={errorClassName}>
            {props.emailError}
          </p>
        )}
      </div>

      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={props.selectionError ? 'interviewer-selection-error' : undefined}
        aria-busy={props.isLoadingRecords}
      >
        <legend className="text-sm font-medium text-slate-200">
          Employment records (select 1 to 10)
        </legend>
        <p className="text-xs text-slate-400" aria-live="polite">
          {selectedCount} selected
        </p>

        {props.isLoadingRecords && <p className="text-slate-400">Loading employment history...</p>}

        {props.recordsError && (
          <div role="alert" className={errorClassName}>
            <p>{props.recordsError}</p>
            <button type="button" onClick={props.onRetryRecords} className="mt-2 underline">
              Retry
            </button>
          </div>
        )}

        {hasNoRecords && (
          <p className="text-sm text-slate-300">
            You have no employment history yet.{' '}
            <Link to="/settings/profile" className="text-blue-400 underline">
              Add employment history in settings
            </Link>{' '}
            to apply.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {props.records.map(function renderRecord(record) {
            const isSelected = props.selectedIds.includes(record.id)
            const checkboxId = `employment-record-${record.id}`

            if (!record.isComplete) {
              return (
                <li
                  key={record.id}
                  className="flex items-start gap-3 rounded-md border border-slate-800 p-3 opacity-80"
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    disabled
                    checked={false}
                    readOnly
                    aria-describedby={`${checkboxId}-status`}
                    className="mt-1"
                  />
                  <div className="flex flex-col">
                    <label htmlFor={checkboxId} className="text-slate-300">
                      {record.company}
                    </label>
                    <span id={`${checkboxId}-status`} className="text-xs text-amber-300">
                      Needs details
                    </span>
                    <Link to="/settings/profile" className="text-xs text-blue-400 underline">
                      Complete this record in settings
                    </Link>
                  </div>
                </li>
              )
            }

            return (
              <li
                key={record.id}
                className="flex items-start gap-3 rounded-md border border-slate-700 p-3"
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isSelected}
                  onChange={function handleToggle() {
                    props.onToggleRecord(record.id)
                  }}
                  // Keep the control focusable and in the a11y tree while submitting so
                  // assistive tech retains selected-record context.
                  aria-disabled={props.isSubmitting || undefined}
                  className="mt-1"
                />
                <label htmlFor={checkboxId} className="flex flex-col text-slate-100">
                  <span>
                    {record.company} - {record.role}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateRange(record.start, record.end)}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        {props.selectionError && (
          <p
            id="interviewer-selection-error"
            ref={selectionErrorRef}
            tabIndex={-1}
            role="alert"
            className={errorClassName}
          >
            {props.selectionError}
          </p>
        )}
      </fieldset>

      {props.submitError && (
        <p ref={submitErrorRef} tabIndex={-1} role="alert" className={errorClassName}>
          {props.submitError} Your selections have been kept; you can try again.
        </p>
      )}

      <button
        type="submit"
        disabled={props.isSubmitting}
        className="self-start rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {props.isSubmitting ? 'Submitting...' : props.submitError ? 'Retry submission' : 'Submit application'}
      </button>
    </form>
  )
}
