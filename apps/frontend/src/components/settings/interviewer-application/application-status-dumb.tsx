import type { InterviewerApplication, InterviewerApplicationStatus } from '@mako/shared'
import { formatDateRange } from '../../profile/company-list/company-list-dumb'

export type ApplicationStatusDumbProps = {
  application: InterviewerApplication
}

const statusCopy: Record<InterviewerApplicationStatus, { label: string; message: string }> = {
  pending: {
    label: 'Pending review',
    message: 'Your application is under review. You cannot submit another one while it is pending.',
  },
  approved: {
    label: 'Approved',
    message: 'Your application was approved. Your account is eligible as a verified interviewer.',
  },
  rejected: {
    label: 'Not approved',
    message: 'Your application was not approved. You can submit a new application below.',
  },
}

export function ApplicationStatusDumb({ application }: ApplicationStatusDumbProps) {
  const copy = statusCopy[application.status]

  return (
    <section
      aria-labelledby="interviewer-application-status-heading"
      className="rounded-xl border border-slate-800 bg-slate-900/60 p-6"
    >
      <h2 id="interviewer-application-status-heading" className="text-xl font-semibold text-white">
        Application status:{' '}
        <span data-testid="application-status" data-status={application.status}>
          {copy.label}
        </span>
      </h2>
      <p className="mt-2 text-sm text-slate-300">{copy.message}</p>
      <p className="mt-2 text-sm text-slate-400">Contact email: {application.email}</p>

      <h3 className="mt-6 text-sm font-medium text-slate-200">Submitted employment history</h3>
      <ul className="mt-2 flex flex-col gap-2" aria-label="Submitted employment history">
        {application.employmentHistory.map(function renderEntry(entry, index) {
          return (
            <li
              key={`${entry.sourceCompanyId ?? 'legacy'}-${index}`}
              className="rounded-md border border-slate-700 p-3"
            >
              <p className="text-slate-100">
                {entry.company} - {entry.role}
              </p>
              <p className="text-xs text-slate-400">{formatDateRange(entry.start, entry.end)}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
