import type { AdminApplicationStatus, AdminApplicationSummary } from '@mako/shared'

export const ADMIN_REVIEW_STATUS_OPTIONS: readonly AdminApplicationStatus[] = [
  'pending',
  'approved',
  'rejected',
]

export type AdminReviewListDumbProps = {
  isDisabled: boolean
  status: AdminApplicationStatus
  onStatusChange: (status: AdminApplicationStatus) => void
  applications: readonly AdminApplicationSummary[]
  isLoading: boolean
  errorMessage: string | null
  onRetry: () => void
  selectedApplicationId: string | null
  onSelect: (applicationId: string) => void
  offset: number
  hasMore: boolean
  onPreviousPage: () => void
  onNextPage: () => void
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC' })
}

export function AdminReviewListDumb(props: AdminReviewListDumbProps) {
  const hasPreviousPage = props.offset > 0

  return (
    <section aria-label="Applications" className="space-y-4">
      <div className="flex items-center gap-2">
        <label htmlFor="admin-review-status" className="text-sm text-slate-300">
          Status
        </label>
        <select
          id="admin-review-status"
          disabled={props.isDisabled}
          value={props.status}
          onChange={function handleChange(event) {
            props.onStatusChange(event.target.value as AdminApplicationStatus)
          }}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white"
        >
          {ADMIN_REVIEW_STATUS_OPTIONS.map(function renderOption(option) {
            return (
              <option key={option} value={option}>
                {option}
              </option>
            )
          })}
        </select>
      </div>

      {props.isLoading ? (
        <p role="status" className="text-sm text-slate-300">
          Loading applications...
        </p>
      ) : props.errorMessage ? (
        <div role="alert" className="space-y-2 text-sm text-rose-200">
          <p>{props.errorMessage}</p>
          <button
            type="button"
            onClick={props.onRetry}
            className="rounded-md border border-rose-700 px-3 py-1.5"
          >
            Retry
          </button>
        </div>
      ) : props.applications.length === 0 ? (
        <p className="text-sm text-slate-300">No {props.status} applications.</p>
      ) : (
        <ul className="space-y-2">
          {props.applications.map(function renderApplication(application) {
            const isSelected = application.applicationId === props.selectedApplicationId

            return (
              <li key={application.applicationId}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={props.isDisabled}
                  onClick={function handleSelect() {
                    props.onSelect(application.applicationId)
                  }}
                  className={[
                    'w-full rounded-md border px-3 py-2 text-left text-sm',
                    isSelected
                      ? 'border-emerald-500 bg-slate-800 text-white'
                      : 'border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800',
                  ].join(' ')}
                >
                  <span className="block font-medium">{application.applicant.name}</span>
                  <span className="block text-xs text-slate-400">
                    {application.applicant.email}
                  </span>
                  <span className="block text-xs text-slate-400">
                    Submitted {formatDate(application.createdAt)}
                    {application.applicant.isAccountDeleted ? ' - account deleted' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={props.onPreviousPage}
          disabled={props.isDisabled || !hasPreviousPage}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={props.onNextPage}
          disabled={props.isDisabled || !props.hasMore}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  )
}
