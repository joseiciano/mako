import type { AdminApplicationDetail, AdminDecision } from '@mako/shared'

export type AdminReviewDetailDumbProps = {
  hasSelection: boolean
  application: AdminApplicationDetail | null
  currentUserId: string | null
  isLoading: boolean
  errorMessage: string | null
  onRetry: () => void
  pendingDecision: AdminDecision | null
  isSubmitting: boolean
  submitErrorMessage: string | null
  onRequestDecision: (decision: AdminDecision) => void
  onCancelDecision: () => void
  onConfirmDecision: () => void
}

function formatDecisionLabel(decision: AdminDecision): string {
  return decision === 'approved' ? 'approve' : 'reject'
}

export function AdminReviewDetailDumb(props: AdminReviewDetailDumbProps) {
  if (!props.hasSelection) {
    return (
      <section aria-label="Application detail">
        <p className="text-sm text-slate-300">Select an application to review.</p>
      </section>
    )
  }

  if (props.isLoading) {
    return (
      <section aria-label="Application detail">
        <p role="status" className="text-sm text-slate-300">
          Loading application...
        </p>
      </section>
    )
  }

  if (props.errorMessage || !props.application) {
    return (
      <section aria-label="Application detail">
        <div role="alert" className="space-y-2 text-sm text-rose-200">
          <p>{props.errorMessage ?? 'Unable to load the application.'}</p>
          <button
            type="button"
            onClick={props.onRetry}
            className="rounded-md border border-rose-700 px-3 py-1.5"
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  const application = props.application
  const isPending = application.status === 'pending'
  const isDeleted = application.applicant.isAccountDeleted
  const isOwnApplication =
    props.currentUserId !== null && application.applicant.userId === props.currentUserId

  return (
    <section aria-label="Application detail" className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-white">{application.applicant.name}</h2>
        <p className="text-sm text-slate-400">{application.applicant.email}</p>
        <p className="text-sm text-slate-300">Status: {application.status}</p>
        {isDeleted ? (
          <p className="text-sm text-amber-300">
            This applicant deleted their account and cannot be approved.
          </p>
        ) : null}
        {isOwnApplication ? (
          <p className="text-sm text-amber-300">
            This is your own application. Another admin must review it.
          </p>
        ) : null}
        {application.reviewedBy ? (
          <p className="text-xs text-slate-400">Reviewed by {application.reviewedBy.name}</p>
        ) : null}
      </header>

      <div>
        <h3 className="text-sm font-medium text-white">Employment history</h3>
        {application.employmentHistory.length === 0 ? (
          <p className="text-sm text-slate-300">No employment history submitted.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {application.employmentHistory.map(function renderEntry(entry, index) {
              return (
                <li key={`${entry.company}-${entry.start}-${index}`}>
                  {entry.role} at {entry.company} ({entry.start} - {entry.end ?? 'present'})
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {props.submitErrorMessage ? (
        <p role="alert" className="text-sm text-rose-200">
          {props.submitErrorMessage}
        </p>
      ) : null}

      {isPending && props.pendingDecision === null ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isDeleted || isOwnApplication}
            onClick={function handleApprove() {
              props.onRequestDecision('approved')
            }}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={isOwnApplication}
            onClick={function handleReject() {
              props.onRequestDecision('rejected')
            }}
            className="rounded-md bg-rose-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Reject
          </button>
        </div>
      ) : null}

      {isPending && props.pendingDecision !== null ? (
        <div role="alertdialog" aria-label="Confirm decision" className="space-y-2">
          <p className="text-sm text-white">
            Are you sure you want to {formatDecisionLabel(props.pendingDecision)} this
            application?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={props.isSubmitting}
              onClick={props.onConfirmDecision}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {props.isSubmitting ? 'Submitting...' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={props.isSubmitting}
              onClick={props.onCancelDecision}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
