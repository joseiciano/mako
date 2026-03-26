import { type FormEvent } from 'react'

export type DeleteAccountConfirmationDumbProps = {
  isOpen: boolean
  confirmationInput: string
  isDeleting: boolean
  canSubmit: boolean
  errorMessage?: string
  onConfirmationInputChange: (value: string) => void
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function DeleteAccountConfirmationDumb(
  props: DeleteAccountConfirmationDumbProps,
) {
  if (!props.isOpen) {
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void props.onConfirm()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <form
        aria-label="Delete account confirmation"
        className="w-full max-w-md rounded-xl border border-red-400/30 bg-slate-900 p-6 shadow-2xl shadow-red-950/40"
        onSubmit={handleSubmit}
      >
        <h2 className="text-xl font-semibold text-red-200">Confirm account deletion</h2>
        <p className="mt-3 text-sm text-slate-300">
          This action is permanent. Type <span className="font-semibold">DELETE</span>{' '}
          to confirm that you want to remove your account.
        </p>

        <label className="mt-5 block text-sm text-slate-200" htmlFor="delete-confirmation-input">
          Confirmation text
        </label>
        <input
          id="delete-confirmation-input"
          type="text"
          autoComplete="off"
          value={props.confirmationInput}
          onChange={function handleConfirmationChange(event) {
            props.onConfirmationInputChange(event.target.value)
          }}
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-red-400 transition focus:ring-2"
          placeholder="Type DELETE"
        />

        {props.errorMessage ? (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {props.errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!props.canSubmit || props.isDeleting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900"
          >
            {props.isDeleting ? 'Deleting...' : 'Delete account permanently'}
          </button>
        </div>
      </form>
    </div>
  )
}
