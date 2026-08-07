import type { CompanyListDumbProps } from './types'
import { getEmploymentFieldErrors } from './validation'

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
            const isIncomplete = !company.isComplete

            return (
              <li
                className="flex items-center justify-between gap-4 rounded-md border border-slate-800 bg-slate-950 px-4 py-3"
                key={company.id}
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-100">{company.company}</p>
                  {isIncomplete ? (
                    <p className="text-sm text-amber-200">
                      Needs details
                    </p>
                  ) : (
                    <p className="text-sm text-slate-300">{company.role}</p>
                  )}
                  <p className="text-sm text-slate-400">
                    {formatDateRange(company.start, company.end)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    aria-label={`Edit ${company.company}`}
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
                    onClick={function onClickEdit() {
                      props.onOpenEditModal(company)
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Delete ${company.company}`}
                    className="rounded-md border border-red-900 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-950/60"
                    onClick={function onClickDelete() {
                      props.onRequestDelete(company)
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {props.isAddModalOpen ? (
        <div
          aria-labelledby="add-company-title"
          aria-modal="true"
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
            <h3
              className="text-base font-semibold text-white"
              id="add-company-title"
            >
              Add Company
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              Add a company, your role, and the dates you worked there.
            </p>

            <form
              className="mt-4 space-y-3"
              onSubmit={function onSubmit(event) {
                event.preventDefault()
                props.onSubmitAddCompany()
              }}
            >
              <EmploymentFormFields {...props} />

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

      {props.isEditModalOpen ? (
        <div
          aria-labelledby="edit-company-title"
          aria-modal="true"
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
            <h3
              className="text-base font-semibold text-white"
              id="edit-company-title"
            >
              Edit Company
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              Update the company details for interviewer verification.
            </p>

            <form
              className="mt-4 space-y-3"
              onSubmit={function onSubmit(event) {
                event.preventDefault()
                props.onSubmitEditCompany()
              }}
            >
              <EmploymentFormFields {...props} />

              <div className="mt-2 flex justify-end gap-2">
                <button
                  className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                  onClick={props.onCloseEditModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md border border-emerald-400 bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={props.isSubmitting}
                  type="submit"
                >
                  {props.isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {props.deleteTarget ? (
        <div
          aria-labelledby="delete-company-title"
          aria-modal="true"
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 px-4"
          role="alertdialog"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
            <h3
              className="text-base font-semibold text-white"
              id="delete-company-title"
            >
              Delete {props.deleteTarget.company}?
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              Deleting this profile record does not alter previously submitted
              applications or automatically revoke interviewer eligibility.
            </p>

            {props.deleteErrorMessage ? (
              <p
                className="mt-3 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200"
                role="alert"
              >
                {props.deleteErrorMessage}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={props.isDeleting}
                onClick={props.onCancelDelete}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md border border-red-500 bg-red-500/20 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={props.isDeleting}
                onClick={props.onConfirmDelete}
                type="button"
              >
                {props.isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function EmploymentFormFields(props: CompanyListDumbProps) {
  const fieldErrors = getEmploymentFieldErrors({
    companyName: props.companyName,
    role: props.role,
    startDate: props.startDate,
    endDate: props.endDate,
  })

  const showEndDateError = !props.isCurrentRole && fieldErrors.endDate !== null

  return (
    <>
      <label className="block text-sm text-slate-200" htmlFor="company-name">
        Company
      </label>
      <input
        aria-invalid={fieldErrors.companyName !== null}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
        id="company-name"
        name="company-name"
        onChange={function onChange(event) {
          props.onCompanyNameChange(event.target.value)
        }}
        type="text"
        value={props.companyName}
      />
      {fieldErrors.companyName ? (
        <p className="text-sm text-red-300" role="alert">
          {fieldErrors.companyName}
        </p>
      ) : null}

      <label className="block text-sm text-slate-200" htmlFor="role">
        Role
      </label>
      <input
        aria-invalid={fieldErrors.role !== null}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
        id="role"
        name="role"
        onChange={function onChange(event) {
          props.onRoleChange(event.target.value)
        }}
        type="text"
        value={props.role}
      />
      {fieldErrors.role ? (
        <p className="text-sm text-red-300" role="alert">
          {fieldErrors.role}
        </p>
      ) : null}

      <label className="block text-sm text-slate-200" htmlFor="start-date">
        Start Date
      </label>
      <input
        aria-invalid={fieldErrors.startDate !== null}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
        id="start-date"
        name="start-date"
        onChange={function onChange(event) {
          props.onStartDateChange(event.target.value)
        }}
        type="date"
        value={props.startDate}
      />
      {fieldErrors.startDate ? (
        <p className="text-sm text-red-300" role="alert">
          {fieldErrors.startDate}
        </p>
      ) : null}

      <label
        className="flex items-center gap-2 text-sm text-slate-200"
        htmlFor="current-role"
      >
        <input
          checked={props.isCurrentRole}
          className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-emerald-500"
          id="current-role"
          name="current-role"
          onChange={function onChange(event) {
            props.onCurrentRoleChange(event.target.checked)
          }}
          type="checkbox"
        />
        Current role
      </label>

      <label className="block text-sm text-slate-200" htmlFor="end-date">
        End Date
      </label>
      <input
        aria-invalid={showEndDateError}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={props.isCurrentRole}
        id="end-date"
        name="end-date"
        onChange={function onChange(event) {
          props.onEndDateChange(event.target.value)
        }}
        type="date"
        value={props.isCurrentRole ? '' : props.endDate}
      />
      {showEndDateError ? (
        <p className="text-sm text-red-300" role="alert">
          {fieldErrors.endDate}
        </p>
      ) : null}

      {props.submitErrorMessage ? (
        <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
          {props.submitErrorMessage}
        </p>
      ) : null}
    </>
  )
}

export function formatDateRange(start: string, end: string | null): string {
  if (end === null) {
    return `${start} — Present`
  }

  return `${start} — ${end}`
}
