import type { FormEvent } from 'react'

export type ScheduleDumbProps = {
  scheduledAt: string
  isSubmitting: boolean
  errorMessage: string | null
  onScheduledAtChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ScheduleDumb(props: ScheduleDumbProps) {
  const isNow = props.scheduledAt === 'now'

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
            Interviews
          </p>
          <h1 className="text-2xl font-semibold text-white">
            Schedule Interview
          </h1>
          <p className="text-sm text-slate-300">
            Book a new system design session with an AI interviewer.
          </p>
        </div>
      </header>

      {props.errorMessage ? (
        <section
          className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100"
          role="alert"
        >
          <p>{props.errorMessage}</p>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <form className="flex flex-col gap-6" onSubmit={props.onSubmit}>
          <div className="flex flex-col gap-2">
            <label htmlFor="interview-type" className="text-sm font-medium text-slate-200">
              Interview Type
            </label>
            <select
              id="interview-type"
              name="type"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400 transition focus:ring-2"
              disabled={props.isSubmitting}
              defaultValue="system_design"
            >
              <option value="system_design">System Design</option>
            </select>
            <p className="text-xs text-slate-400">
              Milestone 2 supports system design interviews only.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="scheduled-at" className="text-sm font-medium text-slate-200">
              When
            </label>
            <select
              id="scheduled-at"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400 transition focus:ring-2"
              disabled={props.isSubmitting}
              value={isNow ? 'now' : 'later'}
              onChange={function onScheduledAtSelectChange(event) {
                const nextValue = event.target.value
                if (nextValue === 'now') {
                  props.onScheduledAtChange('now')
                } else {
                  props.onScheduledAtChange('')
                }
              }}
            >
              <option value="now">Start now</option>
              <option value="later">Schedule for later</option>
            </select>
          </div>

          {!isNow ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="datetime" className="text-sm font-medium text-slate-200">
                Date and Time
              </label>
              <input
                id="datetime"
                type="datetime-local"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400 transition focus:ring-2"
                disabled={props.isSubmitting}
                value={props.scheduledAt}
                onChange={function onDatetimeChange(event) {
                  props.onScheduledAtChange(event.target.value)
                }}
              />
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
            <p>
              <span className="font-medium text-slate-200">Mode:</span> AI-led
            </p>
            <p className="mt-1">
              <span className="font-medium text-slate-200">Tier:</span>{' '}
              Resolved automatically by the server based on your subscription and credits.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Standard peer-to-peer sessions use availability matching rather than direct creation.
            </p>
          </div>

          <button
            className="inline-flex w-fit items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={props.isSubmitting}
          >
            {props.isSubmitting ? 'Scheduling...' : 'Schedule Interview'}
          </button>
        </form>
      </section>
    </main>
  )
}
