import { useEffect, useRef, useState, type FormEvent } from 'react'

export type PublishFormDumbProps = {
  isLoading: boolean
  error: string | null
  leadTimeMinutes: number
  horizonDays: number
  onSubmit: (startTime: string) => void
}

export function PublishFormDumb(props: PublishFormDumbProps) {
  const [startTime, setStartTime] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevErrorRef = useRef<string | null>(null)

  useEffect(function focusOnError() {
    if (props.error && !prevErrorRef.current) {
      if (errorRef.current) {
        errorRef.current.focus()
      } else if (inputRef.current) {
        inputRef.current.focus()
      }
    }
    prevErrorRef.current = props.error
  }, [props.error])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    props.onSubmit(startTime)
  }

  const minDateTime = computeMinDateTime(props.leadTimeMinutes)
  const maxDateTime = computeMaxDateTime(props.horizonDays)

  return (
    <section
      className="rounded-xl border border-slate-800 bg-slate-900/60 p-6"
      aria-label="Publish premium availability slot"
    >
      <h2 className="text-lg font-semibold text-white">Publish a Premium Slot</h2>
      <p className="mt-1 text-sm text-slate-400">
        Offer a 60-minute system design interview slot. Interview type is fixed to system_design.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="premium-start-time" className="text-sm font-medium text-slate-300">
            Start Time
          </label>
          <input
            ref={inputRef}
            id="premium-start-time"
            type="datetime-local"
            value={startTime}
            min={minDateTime}
            max={maxDateTime}
            onChange={function handleChange(event) {
              setStartTime(event.target.value)
            }}
            required
            aria-describedby="premium-start-time-help"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p id="premium-start-time-help" className="text-xs text-slate-500">
            Must be at least {props.leadTimeMinutes} minutes from now and within {props.horizonDays} days.
          </p>
        </div>

        {props.error && (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300"
          >
            {props.error}
          </p>
        )}

        <button
          type="submit"
          disabled={props.isLoading || !startTime}
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {props.isLoading ? 'Publishing...' : 'Publish Slot'}
        </button>
      </form>
    </section>
  )
}

function computeMinDateTime(leadTimeMinutes: number): string {
  const min = new Date(Date.now() + leadTimeMinutes * 60 * 1000)
  return toLocalDateTimeString(min)
}

function computeMaxDateTime(horizonDays: number): string {
  const max = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000)
  return toLocalDateTimeString(max)
}

function toLocalDateTimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}
