import type { PremiumInterviewerSlot, PremiumSlotStatus } from '@mako/shared'

export type SlotListDumbProps = {
  slots: PremiumInterviewerSlot[]
  isLoading: boolean
  error?: string | null
  onRetry?: () => void
  cancelSlotId: string | null
  cancelError: string | null
  onCancel: (slotId: string) => void
}

export function SlotListDumb(props: SlotListDumbProps) {
  if (props.isLoading) {
    return (
      <section
        className="rounded-xl border border-slate-800 bg-slate-900/60 p-6"
        aria-label="Premium slot inventory"
      >
        <h2 className="text-lg font-semibold text-white">Your Premium Slots</h2>
        <p className="mt-2 text-sm text-slate-400">Loading...</p>
      </section>
    )
  }

  if (props.error) {
    return (
      <section
        className="rounded-xl border border-slate-800 bg-slate-900/60 p-6"
        aria-label="Premium slot inventory"
      >
        <h2 className="text-lg font-semibold text-white">Your Premium Slots</h2>
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-300"
        >
          {props.error}
        </p>
        {props.onRetry && (
          <button
            type="button"
            onClick={props.onRetry}
            className="mt-3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
          >
            Retry
          </button>
        )}
      </section>
    )
  }

  if (props.slots.length === 0) {
    return (
      <section
        className="rounded-xl border border-slate-800 bg-slate-900/60 p-6"
        aria-label="Premium slot inventory"
      >
        <h2 className="text-lg font-semibold text-white">Your Premium Slots</h2>
        <p className="mt-2 text-sm text-slate-400">
          No premium slots published yet. Use the form above to publish your first slot.
        </p>
      </section>
    )
  }

  return (
    <section
      className="rounded-xl border border-slate-800 bg-slate-900/60 p-6"
      aria-label="Premium slot inventory"
    >
      <h2 className="text-lg font-semibold text-white">Your Premium Slots</h2>

      {props.cancelError && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-300"
        >
          {props.cancelError}
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {props.slots.map(function renderSlot(slot) {
          return (
            <li
              key={slot.id}
              className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-white">
                  {formatSlotTime(slot.startTime)}
                </span>
                <span className="text-xs text-slate-400">
                  60 minutes &middot; System Design
                </span>
                <StatusBadge status={slot.status} />
              </div>

              {slot.status === 'available' && (
                <button
                  type="button"
                  disabled={props.cancelSlotId === slot.id}
                  onClick={function handleCancel() {
                    props.onCancel(slot.id)
                  }}
                  aria-label={`Cancel slot at ${formatSlotTime(slot.startTime)}`}
                  className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-1.5 text-sm font-medium text-red-300 transition hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {props.cancelSlotId === slot.id ? 'Cancelling...' : 'Cancel'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function StatusBadge(props: { status: PremiumSlotStatus }) {
  const label = statusLabel(props.status)

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(props.status)}`}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  )
}

function statusLabel(status: PremiumSlotStatus): string {
  switch (status) {
    case 'available':
      return 'Available'
    case 'claimed':
      return 'Claimed'
    case 'cancelled':
      return 'Cancelled'
  }
}

function statusBadgeClass(status: PremiumSlotStatus): string {
  switch (status) {
    case 'available':
      return 'bg-green-900/40 text-green-300'
    case 'claimed':
      return 'bg-blue-900/40 text-blue-300'
    case 'cancelled':
      return 'bg-slate-700 text-slate-400'
  }
}

function formatSlotTime(startTime: string): string {
  const date = new Date(startTime)
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}
