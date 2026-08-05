import type { FormEvent } from 'react'
import type { AIChatDumbProps } from './ai-chat-types'

export function AIChatDumb(props: AIChatDumbProps) {
  const isSending = props.submitState === 'sending'

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (props.disabled || isSending || props.inputValue.trim().length === 0) {
      return
    }
    props.onSubmit()
  }

  return (
    <section
      aria-label="AI interviewer chat"
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
    >
      <h2 className="mb-4 text-lg font-semibold text-white">AI Coach Chat</h2>

      {props.messages.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">
          Ask the AI interviewer for guidance. Your current whiteboard is included
          with each message so the AI can review your design.
        </p>
      ) : (
        <div className="mb-4 flex max-h-72 flex-col gap-3 overflow-y-auto">
          {props.messages.map(function renderMessage(message) {
            const isUser = message.role === 'user'
            const isFailed = message.isError === true
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    isUser
                      ? 'bg-emerald-600 text-slate-950'
                      : 'bg-slate-800 text-slate-100'
                  } ${isFailed ? 'border border-red-700' : ''}`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isSending ? (
        <p aria-live="polite" className="mb-3 text-sm text-slate-300" role="status">
          AI interviewer is thinking…
        </p>
      ) : null}

      {props.submitState === 'error' && props.errorMessage ? (
        <div
          className="mb-3 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
          role="alert"
        >
          <p>{props.errorMessage}</p>
          {props.retryLimitReached ? (
            <p className="mt-1 text-xs">
              Retry limit reached. Type a new message to try again.
            </p>
          ) : null}
        </div>
      ) : null}

      {props.submitState === 'error' && props.canRetry ? (
        <button
          className="mb-3 inline-flex rounded-md border border-red-400 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
          onClick={props.onRetry}
          type="button"
        >
          Retry
        </button>
      ) : null}

      <form className="flex gap-2" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="ai-chat-input">
          Message the AI interviewer
        </label>
        <textarea
          className="min-h-[3rem] flex-1 resize-y rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          disabled={props.disabled || isSending}
          id="ai-chat-input"
          onChange={function handleChange(event) {
            props.onInputChange(event.target.value)
          }}
          placeholder="Ask for guidance on your design…"
          value={props.inputValue}
        />
        <button
          className="inline-flex items-center self-end rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={props.disabled || isSending || props.inputValue.trim().length === 0}
          type="submit"
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  )
}
