import { useEffect, useRef, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import type { EmploymentRecordCompatibilityResponse } from '@mako/shared'
import { formatDateRange } from '../../profile/company-list/company-list-dumb'
import type { ApplicationFormErrors } from './validate-application'

type ApplicationFormDumbProps = {
  records: EmploymentRecordCompatibilityResponse[]
  selectedIds: string[]
  email: string
  isSubmitting: boolean
  errors: ApplicationFormErrors
  errorFocusKey: number
  onToggleRecord: (id: string) => void
  onEmailChange: (email: string) => void
  onSubmit: () => void
}

export function ApplicationFormDumb(props: ApplicationFormDumbProps) {
  const firstCheckboxRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const submitErrorRef = useRef<HTMLParagraphElement>(null)
  const { errors, errorFocusKey } = props

  useEffect(
    function focusFirstError() {
      if (errorFocusKey === 0) return
      if (errors.selection) firstCheckboxRef.current?.focus()
      else if (errors.email) emailRef.current?.focus()
      else if (errors.submit) submitErrorRef.current?.focus()
    },
    [errorFocusKey],
  )

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!props.isSubmitting) props.onSubmit()
  }

  if (props.records.length === 0) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <h3 className="text-lg font-semibold text-white">Apply as a verified interviewer</h3>
        <p className="mt-2 text-sm text-slate-300">
          Add your employment history before applying.{' '}
          <Link to="/settings/profile" className="text-blue-400 hover:underline">
            Add employment history in settings
          </Link>
        </p>
        <CopyNotice />
      </section>
    )
  }

  const firstCompleteId = props.records.find(function isComplete(r) {
    return r.isComplete
  })?.id
  const selectedCount = props.records.filter(function isSelected(record) {
    return record.isComplete && props.selectedIds.includes(record.id)
  }).length
  const selectionErrorId = 'application-selection-error'
  const emailErrorId = 'application-email-error'

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={props.isSubmitting}
      className="flex flex-col gap-5 rounded-lg border border-slate-800 bg-slate-900/40 p-6"
    >
      <h3 className="text-lg font-semibold text-white">Apply as a verified interviewer</h3>
      <CopyNotice />

      {props.errors.submit && (
        <p ref={submitErrorRef} tabIndex={-1} role="alert" className="text-sm text-red-300">
          {props.errors.submit}
        </p>
      )}

      <fieldset
        aria-describedby={props.errors.selection ? selectionErrorId : undefined}
        className="flex flex-col gap-2"
      >
        <legend className="mb-2 text-sm font-medium text-slate-200">
          Select 1 to 10 employment records ({selectedCount} selected)
        </legend>
        {props.errors.selection && (
          <p id={selectionErrorId} role="alert" className="text-sm text-red-300">
            {props.errors.selection}
          </p>
        )}
        {props.records.map(function renderRecord(record) {
          const inputId = `employment-${record.id}`
          const range = formatDateRange(record.start, record.end)
          if (!record.isComplete) {
            return (
              <div key={record.id} className="rounded-lg border border-slate-800 p-3 opacity-80">
                <p className="font-medium text-slate-300">{record.company}</p>
                <p className="text-sm text-slate-400">{range}</p>
                <p className="mt-1 text-sm text-amber-300">
                  Needs details.{' '}
                  <Link to="/settings/profile" className="text-blue-400 hover:underline">
                    Complete this record in settings
                  </Link>
                </p>
              </div>
            )
          }
          return (
            <label
              key={record.id}
              htmlFor={inputId}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 p-3"
            >
              <input
                id={inputId}
                ref={record.id === firstCompleteId ? firstCheckboxRef : undefined}
                type="checkbox"
                checked={props.selectedIds.includes(record.id)}
                onChange={function toggle() {
                  props.onToggleRecord(record.id)
                }}
                className="mt-1"
              />
              <span>
                <span className="block font-medium text-white">{record.company}</span>
                <span className="block text-sm text-slate-300">{record.role}</span>
                <span className="block text-sm text-slate-400">{range}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="application-email" className="text-sm font-medium text-slate-200">
          Contact email
        </label>
        <input
          id="application-email"
          ref={emailRef}
          type="email"
          value={props.email}
          onChange={function change(event) {
            props.onEmailChange(event.target.value)
          }}
          aria-invalid={props.errors.email ? true : undefined}
          aria-describedby={props.errors.email ? emailErrorId : undefined}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        {props.errors.email && (
          <p id={emailErrorId} role="alert" className="text-sm text-red-300">
            {props.errors.email}
          </p>
        )}
      </div>

      <button
        type="submit"
        aria-disabled={props.isSubmitting}
        disabled={props.isSubmitting}
        className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {props.isSubmitting
          ? 'Submitting...'
          : props.errors.submit
            ? 'Retry submission'
            : 'Submit application'}
      </button>
    </form>
  )
}

function CopyNotice() {
  return (
    <p className="text-sm text-slate-400">
      Selected details are copied into your application for review. They will not change when you
      edit your profile later.
    </p>
  )
}
