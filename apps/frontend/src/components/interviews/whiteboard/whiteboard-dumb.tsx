import type { WhiteboardDumbProps } from './whiteboard-types'

export function WhiteboardDumb({
  status,
  errorMessage,
  onRetryJoin,
  canvasSlot,
}: WhiteboardDumbProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold text-white">Whiteboard</h2>

      {status === 'failed' ? (
        <FailedFallback
          errorMessage={errorMessage}
          onRetryJoin={onRetryJoin}
        />
      ) : null}

      {status === 'connecting' ? (
        <StatusMessage message="Loading whiteboard..." />
      ) : null}

      {status === 'reconnecting' ? (
        <StatusMessage message="Reconnecting to whiteboard..." />
      ) : null}

      {status === 'connected' || status === 'connecting' || status === 'reconnecting' ? (
        <div className="mt-4">{canvasSlot}</div>
      ) : null}
    </section>
  )
}

function StatusMessage({ message }: { message: string }) {
  return (
    <p
      aria-live="polite"
      className="mt-2 text-sm text-slate-300"
      role="status"
    >
      {message}
    </p>
  )
}

function FailedFallback({
  errorMessage,
  onRetryJoin,
}: {
  errorMessage: string | null
  onRetryJoin: () => void
}) {
  return (
    <div
      className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-4"
      role="alert"
    >
      <p className="text-sm text-red-200">
        {errorMessage ?? 'Whiteboard connection failed.'}
      </p>
      <button
        className="mt-3 inline-flex rounded-md border border-red-400 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
        onClick={onRetryJoin}
        type="button"
      >
        Retry
      </button>
    </div>
  )
}
