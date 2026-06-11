import type { InterviewType, InterviewMode } from '@mako/shared'
import {
  getStepLabel,
  type ScheduleStep,
  type FlowSlot,
  type ScheduleFieldErrors,
} from './schedule-flow'

export type ScheduleDumbProps = {
  step: ScheduleStep
  visibleSteps: ScheduleStep[]
  interviewType: InterviewType | null
  mode: InterviewMode | null
  scheduledAt: 'now' | string | null
  maxMatches: number | null
  slots: FlowSlot[]
  isSubmitting: boolean
  errorMessage: string | null
  fieldErrors: ScheduleFieldErrors
  canAdvance: boolean
  canGoBack: boolean
  onSetType: (type: InterviewType) => void
  onSetMode: (mode: InterviewMode) => void
  onSetScheduledAt: (value: 'now' | string) => void
  onSetMaxMatches: (value: number) => void
  onSetSlots: (slots: FlowSlot[]) => void
  onNext: () => void
  onBack: () => void
  onGoToStep: (step: ScheduleStep) => void
  onConfirm: () => void
}

function StepIndicator(props: {
  steps: ScheduleStep[]
  current: ScheduleStep
  onGoToStep: (step: ScheduleStep) => void
}) {
  return (
    <nav aria-label="Schedule steps">
      <ol className="flex items-center gap-2">
        {props.steps.map(function renderStep(step, index) {
          const isCurrent = step === props.current
          const isPast = props.steps.indexOf(props.current) > index
          return (
            <li key={step} className="flex items-center gap-2">
              {index > 0 ? (
                <span
                  className={`h-px w-4 ${isPast ? 'bg-emerald-400' : 'bg-slate-700'}`}
                />
              ) : null}
              <button
                type="button"
                onClick={function onStepClick() {
                  if (isPast) {
                    props.onGoToStep(step)
                  }
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                  isCurrent
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                    : isPast
                      ? 'text-emerald-400 hover:text-emerald-300'
                      : 'text-slate-500'
                }`}
                disabled={!isPast}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                    isCurrent
                      ? 'bg-emerald-500 text-slate-950'
                      : isPast
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {index + 1}
                </span>
                {getStepLabel(step)}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function TypeStep(props: {
  value: InterviewType | null
  onChange: (type: InterviewType) => void
  disabled: boolean
  error?: string
}) {
  const selected = props.value === 'system_design'

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">Select Interview Type</h2>
      <div className="grid gap-3">
        <button
          type="button"
          onClick={function onTypeClick() {
            props.onChange('system_design')
          }}
          disabled={props.disabled}
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
            selected
              ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
              : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800/40'
          }`}
        >
          <span className="text-sm font-medium">System Design</span>
          {selected ? <span className="text-emerald-400">&#10003;</span> : null}
        </button>
      </div>
      {props.error ? (
        <p className="text-xs text-rose-300" role="alert">
          {props.error}
        </p>
      ) : null}
      <p className="text-xs text-slate-400">
        Milestone 2 supports system design interviews only. Additional documented interview
        types remain reserved for later UI rollout.
      </p>
    </div>
  )
}

function ModeStep(props: {
  value: InterviewMode | null
  onChange: (mode: InterviewMode) => void
  disabled: boolean
  error?: string
}) {
  const modes: { value: InterviewMode; label: string; description: string }[] = [
    {
      value: 'ai_led',
      label: 'AI-Led',
      description: 'Practice with an AI interviewer. Start immediately or schedule for later.',
    },
    {
      value: 'peer_to_peer',
      label: 'Peer-to-Peer',
      description: 'Match with another candidate. Submit your availability and we will pair you.',
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">Select Mode</h2>
      <div className="grid gap-3">
        {modes.map(function renderModeOption(mode) {
          const selected = props.value === mode.value
          return (
            <button
              key={mode.value}
              type="button"
              onClick={function onModeClick() {
                props.onChange(mode.value)
              }}
              disabled={props.disabled}
              className={`flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition ${
                selected
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
                  : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800/40'
              }`}
            >
              <span className="text-sm font-medium">{mode.label}</span>
              <span className="text-xs text-slate-400">
                {mode.description}
              </span>
            </button>
          )
        })}
      </div>
      {props.error ? (
        <p className="text-xs text-rose-300" role="alert">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

function TimingStep(props: {
  value: 'now' | string | null
  onChange: (value: 'now' | string) => void
  disabled: boolean
  error?: string
}) {
  const isNow = props.value === 'now'
  const isLater = props.value !== null && props.value !== 'now'

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">When would you like to start?</h2>
      <div className="grid gap-3">
        <button
          type="button"
          onClick={function onNowClick() {
            props.onChange('now')
          }}
          disabled={props.disabled}
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
            isNow
              ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
              : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800/40'
          }`}
        >
          <span className="text-sm font-medium">Start now</span>
          {isNow ? <span className="text-emerald-400">&#10003;</span> : null}
        </button>
        <button
          type="button"
          onClick={function onLaterClick() {
            props.onChange('')
          }}
          disabled={props.disabled}
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
            isLater
              ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
              : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800/40'
          }`}
        >
          <span className="text-sm font-medium">Schedule for later</span>
          {isLater ? <span className="text-emerald-400">&#10003;</span> : null}
        </button>
      </div>
      {isLater ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="datetime" className="text-sm font-medium text-slate-200">
            Date and Time
          </label>
          <input
            id="datetime"
            type="datetime-local"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400 transition focus:ring-2"
            disabled={props.disabled}
            value={props.value ?? ''}
            onChange={function onDatetimeChange(event) {
              props.onChange(event.target.value)
            }}
          />
          {props.error ? (
            <p className="text-xs text-rose-300" role="alert">
              {props.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function AvailabilityStep(props: {
  maxMatches: number | null
  slots: FlowSlot[]
  onSetMaxMatches: (value: number) => void
  onSetSlots: (slots: FlowSlot[]) => void
  disabled: boolean
  maxMatchesError?: string
  slotsError?: string
}) {
  function addSlot() {
    props.onSetSlots([...props.slots, { startTime: '', endTime: '' }])
  }

  function updateSlot(index: number, field: keyof FlowSlot, value: string) {
    const next = props.slots.map(function mapSlot(slot, i) {
      if (i !== index) return slot
      return { ...slot, [field]: value }
    })
    props.onSetSlots(next)
  }

  function removeSlot(index: number) {
    const next = props.slots.filter(function filterSlot(_, i) {
      return i !== index
    })
    props.onSetSlots(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">Your Availability</h2>
      <div className="flex flex-col gap-2">
        <label htmlFor="max-matches" className="text-sm font-medium text-slate-200">
          Maximum Matches
        </label>
        <input
          id="max-matches"
          type="number"
          min={1}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400 transition focus:ring-2"
          disabled={props.disabled}
          value={props.maxMatches ?? ''}
          onChange={function onMaxMatchesChange(event) {
            const value = parseInt(event.target.value, 10)
            props.onSetMaxMatches(Number.isNaN(value) ? 0 : value)
          }}
        />
        {props.maxMatchesError ? (
          <p className="text-xs text-rose-300" role="alert">
            {props.maxMatchesError}
          </p>
        ) : null}
        <p className="text-xs text-slate-400">
          How many interviews do you want to be matched for?
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-slate-200">Time Slots (60 minutes each)</p>
        {props.slotsError ? (
          <p className="text-xs text-rose-300" role="alert">
            {props.slotsError}
          </p>
        ) : null}
        {props.slots.map(function renderSlot(slot, index) {
          return (
            <div key={index} className="flex items-center gap-2">
              <input
                aria-label={`Slot ${index + 1} start time`}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400 transition focus:ring-2"
                disabled={props.disabled}
                value={slot.startTime}
                onChange={function onStartChange(event) {
                  updateSlot(index, 'startTime', event.target.value)
                }}
              />
              <span className="text-slate-500">-</span>
              <input
                aria-label={`Slot ${index + 1} end time`}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-400 transition focus:ring-2"
                disabled={props.disabled}
                value={slot.endTime}
                onChange={function onEndChange(event) {
                  updateSlot(index, 'endTime', event.target.value)
                }}
              />
              <button
                type="button"
                onClick={function onRemoveClick() {
                  removeSlot(index)
                }}
                disabled={props.disabled}
                className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-300 transition hover:bg-rose-500/10"
              >
                Remove
              </button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={addSlot}
          disabled={props.disabled}
          className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800"
        >
          + Add Slot
        </button>
      </div>
    </div>
  )
}

function ConfirmStep(props: {
  interviewType: InterviewType | null
  mode: InterviewMode | null
  scheduledAt: 'now' | string | null
  maxMatches: number | null
  slots: FlowSlot[]
  disabled: boolean
  onGoToStep: (step: ScheduleStep) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">Confirm Your Interview</h2>
      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/80 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Type</p>
            <p className="text-sm text-slate-200">
              {props.interviewType === 'system_design'
                ? 'System Design'
                : props.interviewType === 'coding'
                  ? 'Coding'
                  : props.interviewType === 'behavioral'
                    ? 'Behavioral'
                    : '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={function onEditType() {
              props.onGoToStep('type')
            }}
            disabled={props.disabled}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            Edit
          </button>
        </div>
        <div className="h-px bg-slate-800" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Mode</p>
            <p className="text-sm text-slate-200">
              {props.mode === 'ai_led'
                ? 'AI-Led'
                : props.mode === 'peer_to_peer'
                  ? 'Peer-to-Peer'
                  : '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={function onEditMode() {
              props.onGoToStep('mode')
            }}
            disabled={props.disabled}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            Edit
          </button>
        </div>
        {props.mode === 'ai_led' ? (
          <>
            <div className="h-px bg-slate-800" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Timing</p>
                <p className="text-sm text-slate-200">
                  {props.scheduledAt === 'now'
                    ? 'Start now'
                    : props.scheduledAt ?? '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={function onEditTiming() {
                  props.onGoToStep('timing')
                }}
                disabled={props.disabled}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Edit
              </button>
            </div>
          </>
        ) : null}
        {props.mode === 'peer_to_peer' ? (
          <>
            <div className="h-px bg-slate-800" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Max Matches</p>
                <p className="text-sm text-slate-200">
                  <span data-testid="confirm-max-matches">{props.maxMatches ?? '—'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={function onEditAvailability() {
                  props.onGoToStep('availability')
                }}
                disabled={props.disabled}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Edit
              </button>
            </div>
            <div className="h-px bg-slate-800" />
            <div>
              <p className="text-xs text-slate-400">Slots</p>
              <ul className="mt-1 flex flex-col gap-1">
                {props.slots.length === 0 ? (
                  <li className="text-sm text-slate-200">—</li>
                ) : (
                  props.slots.map(function renderSlot(slot, index) {
                    return (
                      <li key={index} className="text-sm text-slate-200">
                        {slot.startTime} — {slot.endTime}
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function ScheduleDumb(props: ScheduleDumbProps) {
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
            Book a new interview session.
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
        <StepIndicator
          steps={props.visibleSteps}
          current={props.step}
          onGoToStep={props.onGoToStep}
        />
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        {props.step === 'type' ? (
          <TypeStep
            value={props.interviewType}
            onChange={props.onSetType}
            disabled={props.isSubmitting}
            error={props.fieldErrors.interviewType}
          />
        ) : null}
        {props.step === 'mode' ? (
          <ModeStep
            value={props.mode}
            onChange={props.onSetMode}
            disabled={props.isSubmitting}
            error={props.fieldErrors.mode}
          />
        ) : null}
        {props.step === 'timing' ? (
          <TimingStep
            value={props.scheduledAt}
            onChange={props.onSetScheduledAt}
            disabled={props.isSubmitting}
            error={props.fieldErrors.scheduledAt}
          />
        ) : null}
        {props.step === 'availability' ? (
          <AvailabilityStep
            maxMatches={props.maxMatches}
            slots={props.slots}
            onSetMaxMatches={props.onSetMaxMatches}
            onSetSlots={props.onSetSlots}
            disabled={props.isSubmitting}
            maxMatchesError={props.fieldErrors.maxMatches}
            slotsError={props.fieldErrors.slots}
          />
        ) : null}
        {props.step === 'confirm' ? (
          <ConfirmStep
            interviewType={props.interviewType}
            mode={props.mode}
            scheduledAt={props.scheduledAt}
            maxMatches={props.maxMatches}
            slots={props.slots}
            disabled={props.isSubmitting}
            onGoToStep={props.onGoToStep}
          />
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          {props.canGoBack ? (
            <button
              type="button"
              onClick={props.onBack}
              disabled={props.isSubmitting}
              className="inline-flex w-fit items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Back
            </button>
          ) : null}
          {props.step === 'confirm' ? (
            <button
              type="button"
              onClick={props.onConfirm}
              disabled={props.isSubmitting}
              className="inline-flex w-fit items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {props.isSubmitting ? 'Submitting...' : 'Confirm & Schedule'}
            </button>
          ) : (
            <button
              type="button"
              onClick={props.onNext}
              disabled={!props.canAdvance || props.isSubmitting}
              className="inline-flex w-fit items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Next
            </button>
          )}
        </div>
      </section>
    </main>
  )
}
