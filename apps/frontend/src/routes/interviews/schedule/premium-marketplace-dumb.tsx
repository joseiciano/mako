import type { PremiumMarketplaceSlot } from '@mako/shared'
import { Link } from '@tanstack/react-router'
import { formatScheduledTime } from '#/lib/format-scheduled-time'

export type PremiumMarketplaceErrorOutcome = {
  message: string
  retryLabel: string | null
  sameSlotResubmitLabel: string | null
  billingHref: string | null
}

export type PremiumMarketplaceDumbProps = {
  slots: PremiumMarketplaceSlot[]
  priceCredits: number
  accountCredits: number | null
  isLoading: boolean
  isError: boolean
  isReserving: boolean
  pendingClaimMessage: string | null
  errorOutcome: PremiumMarketplaceErrorOutcome | null
  bookedInterviewId: string | null
  onBookSlot: (slotId: string) => void
  onRetry: () => void
  onSameSlotResubmit: () => void
  onRetryMarketplace: () => void
}

function SlotCard(props: {
  slot: PremiumMarketplaceSlot
  isReserving: boolean
  bookingDisabled: boolean
  onBookSlot: (slotId: string) => void
}) {
  const interviewer = props.slot.interviewer

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex items-center gap-3">
        {interviewer.image !== null ? (
          <img
            src={interviewer.image}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : null}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-white">
            {interviewer.displayName}
          </span>
          {interviewer.isVerified ? (
            <span className="text-xs text-emerald-400" data-testid="verified-badge">
              Verified
            </span>
          ) : null}
        </div>
      </div>
      <span className="text-xs text-slate-400">System Design</span>
      <span className="text-xs text-slate-400">
        {formatScheduledTime(props.slot.startTime)} — {formatScheduledTime(props.slot.endTime)}
      </span>
      <button
        type="button"
        onClick={function onBook() {
          props.onBookSlot(props.slot.slotId)
        }}
        aria-label={
          props.isReserving
            ? `Reserving slot with ${interviewer.displayName} at ${formatScheduledTime(props.slot.startTime)}`
            : `claim this slot with ${interviewer.displayName} at ${formatScheduledTime(props.slot.startTime)}`
        }
        disabled={props.isReserving || props.bookingDisabled}
        className="mt-2 inline-flex w-fit items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {props.isReserving ? 'Reserving...' : 'Claim this slot'}
      </button>
    </li>
  )
}

export function PremiumMarketplaceDumb(props: PremiumMarketplaceDumbProps) {
  const bookingBlocked = props.pendingClaimMessage !== null

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
            Premium Marketplace
          </p>
          <h1 className="text-2xl font-semibold text-white">
            Verified Interviewer Slots
          </h1>
          <p className="text-sm text-slate-300">
            Browse and claim system design slots from verified interviewers.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p>
          Each claim costs exactly{' '}
          <strong className="text-white">{props.priceCredits} credit</strong>{' '}
          and the free Standard quota does not apply.
          {props.accountCredits !== null ? (
            <>
              {' '}Your balance:{' '}
              <strong className="text-white">
                {props.accountCredits} credit{props.accountCredits !== 1 ? 's' : ''}
              </strong>{' '}
              available.
            </>
          ) : null}
        </p>
      </section>

      {props.bookedInterviewId !== null ? (
        <section
          className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 p-4 text-sm text-emerald-100"
          role="status"
          aria-live="polite"
        >
          <p>
            Slot booked! Your interview (<span className="font-mono text-xs">{props.bookedInterviewId}</span>) has been
            confirmed. You can find it in your interviews.
          </p>
        </section>
      ) : null}

      {props.errorOutcome !== null ? (
        <section
          className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100"
          role="alert"
        >
          <p>{props.errorOutcome.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {props.errorOutcome.retryLabel !== null ? (
              <button
                type="button"
                onClick={props.onRetry}
                disabled={props.isReserving}
                className="inline-flex w-fit items-center justify-center rounded-lg border border-rose-300/60 px-3 py-1.5 text-xs font-semibold text-rose-50 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {props.errorOutcome.retryLabel}
              </button>
            ) : null}
            {props.errorOutcome.sameSlotResubmitLabel !== null ? (
              <button
                type="button"
                onClick={props.onSameSlotResubmit}
                disabled={props.isReserving}
                className="inline-flex w-fit items-center justify-center rounded-lg border border-rose-300/60 px-3 py-1.5 text-xs font-semibold text-rose-50 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {props.errorOutcome.sameSlotResubmitLabel}
              </button>
            ) : null}
            {props.errorOutcome.billingHref !== null ? (
              <Link
                to={props.errorOutcome.billingHref}
                className="inline-flex w-fit items-center justify-center rounded-lg border border-rose-300/60 px-3 py-1.5 text-xs font-semibold text-rose-50 transition hover:bg-rose-500/20"
              >
                Add credits in Billing
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {props.pendingClaimMessage !== null ? (
        <section
          className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-4 text-sm text-amber-100"
          role="status"
          aria-live="polite"
        >
          <p>{props.pendingClaimMessage}</p>
        </section>
      ) : null}

      {props.isLoading ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          <p>Loading verified interviewer slots...</p>
        </section>
      ) : null}

      {props.isError ? (
        <section
          className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100"
          role="alert"
        >
          <p>Unable to load verified interviewer slots. Please try again.</p>
          <button
            type="button"
            onClick={props.onRetryMarketplace}
            className="mt-3 inline-flex w-fit items-center justify-center rounded-lg border border-rose-300/60 px-3 py-1.5 text-xs font-semibold text-rose-50 transition hover:bg-rose-500/20"
          >
            Try again
          </button>
        </section>
      ) : null}

      {!props.isLoading && !props.isError && props.slots.length === 0 ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          <p>No verified-interviewer slots are currently available.</p>
        </section>
      ) : null}

      {props.slots.length > 0 ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Available Slots</h2>
          <ul className="flex flex-col gap-3">
            {props.slots.map(function renderSlot(slot) {
              return (
                <SlotCard
                  key={slot.slotId}
                  slot={slot}
                  isReserving={props.isReserving}
                  bookingDisabled={bookingBlocked}
                  onBookSlot={props.onBookSlot}
                />
              )
            })}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
