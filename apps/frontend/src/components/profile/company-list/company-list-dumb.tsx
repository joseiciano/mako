import type { CompanyListDumbProps } from './types'

export function CompanyListDumb(props: CompanyListDumbProps) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Professional History</h2>
          <p className="text-sm text-slate-300">
            Add your company background for future interviewer verification.
          </p>
        </div>
        <button
          className="rounded-md border border-emerald-400 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
          onClick={props.onOpenAddModal}
          type="button"
        >
          Add Company
        </button>
      </div>

      {props.isLoading ? (
        <p className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
          Loading company history...
        </p>
      ) : null}

      {props.isError ? (
        <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {props.errorMessage ?? 'Could not load companies.'}
        </p>
      ) : null}

      {!props.isLoading && !props.isError && props.companies.length === 0 ? (
        <p className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
          No company history yet. Add your first company.
        </p>
      ) : null}

      {!props.isLoading && !props.isError && props.companies.length > 0 ? (
        <ul className="space-y-2" aria-label="Company history list">
          {props.companies.map(function mapCompany(company) {
            return (
              <li
                className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-4 py-3"
                key={company.id}
              >
                <span className="font-medium text-slate-100">{company.company}</span>
                <time className="text-sm text-slate-400" dateTime={company.joined}>
                  Joined {formatJoinedDate(company.joined)}
                </time>
              </li>
            )
          })}
        </ul>
      ) : null}

      {props.isAddModalOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
            <h3 className="text-base font-semibold text-white">Add Company</h3>
            <p className="mt-1 text-sm text-slate-300">
              Add a company and the date you joined.
            </p>

            <form
              className="mt-4 space-y-3"
              onSubmit={function onSubmit(event) {
                event.preventDefault()
                props.onSubmitAddCompany()
              }}
            >
              <label className="block text-sm text-slate-200" htmlFor="company-name">
                Company Name
              </label>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                id="company-name"
                name="company-name"
                onChange={function onChange(event) {
                  props.onCompanyNameChange(event.target.value)
                }}
                required
                type="text"
                value={props.companyName}
              />

              <label className="block text-sm text-slate-200" htmlFor="joined-date">
                Joined Date
              </label>
              <input
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                id="joined-date"
                name="joined-date"
                onChange={function onChange(event) {
                  props.onJoinedDateChange(event.target.value)
                }}
                required
                type="date"
                value={props.joinedDate}
              />

              {props.submitErrorMessage ?
                <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {props.submitErrorMessage}
                </p>
              : null}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                  onClick={props.onCloseAddModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md border border-emerald-400 bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={props.isSubmitting}
                  type="submit"
                >
                  {props.isSubmitting ? 'Saving...' : 'Save Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function formatJoinedDate(joinedDateIsoString: string): string {
  const joinedDate = new Date(joinedDateIsoString)

  if (Number.isNaN(joinedDate.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(joinedDate)
}
