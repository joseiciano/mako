export type DangerZoneDumbProps = {
  onDeleteAccount: () => void
}

export function DangerZoneDumb(props: DangerZoneDumbProps) {
  return (
    <section className="rounded-xl border border-red-500/40 bg-red-950/20 p-6" aria-labelledby="danger-zone-title">
      <h2 id="danger-zone-title" className="text-lg font-semibold text-red-200">
        Danger Zone
      </h2>
      <p className="mt-2 text-sm text-red-100/90">
        Deleting your account is permanent. Your profile will be soft deleted,
        all active sessions will be invalidated, and upcoming interviews will be
        cancelled.
      </p>

      <button
        type="button"
        onClick={props.onDeleteAccount}
        className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
      >
        Delete Account
      </button>
    </section>
  )
}
