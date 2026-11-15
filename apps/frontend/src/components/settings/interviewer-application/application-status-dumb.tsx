import type { InterviewerApplication } from '@mako/shared'
import { formatDateRange } from '../../profile/company-list/company-list-dumb'

type ApplicationStatusDumbProps = {
  application: InterviewerApplication
}

const statusCopy = {
  pending: {
    label: 'Pending review',
    detail: 'Your application is under review. You cannot submit another one while it is pending.',
  },
  approved: {
    label: 'Approved',
    detail: 'Your account is approved as a verified interviewer.',
  },
  rejected: {
    label: 'Rejected',
    detail: 'This application was not approved. You can submit a new application below.',
  },
} as const

export function ApplicationStatusDumb(props: ApplicationStatusDumbProps) {
  const { application } = props
  const copy = statusCopy[application.status]

  return (
    <section
      aria-labelledby="application-status-heading"
      className="rounded-lg border border-slate-800 bg-slate-900/40 p-6"
    >
      <h3 id="application-status-heading" className="text-lg font-semibold text-white">
        Application status:{' '}
        <span data-testid="application-status">{copy.label}</span>
      </h3>
      <p className="mt-2 text-sm text-slate-300">{copy.detail}</p>
      <p className="mt-2 text-sm text-slate-400">Contact email: {application.email}</p>

      <h4 className="mt-4 text-sm font-semibold text-slate-200">Submitted employment history</h4>
      <p className="mt-1 text-xs text-slate-400">
        This is a copy taken at submission. It does not change when you edit your profile.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {application.employmentHistory.map(function renderEntry(entry, index) {
          return (
            <li
              key={`${entry.sourceCompanyId ?? 'legacy'}-${index}`}
              className="rounded-lg border border-slate-800 p-3"
            >
              <p className="font-medium text-white">{entry.company}</p>
              <p className="text-sm text-slate-300">{entry.role}</p>
              <p className="text-sm text-slate-400">{formatDateRange(entry.start, entry.end)}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
