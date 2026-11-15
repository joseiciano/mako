import type { ReactNode } from 'react'

export type AdminReviewLayoutDumbProps = {
  list: ReactNode
  detail: ReactNode
  sessionLostMessage: string | null
  conflictMessage: string | null
}

export function AdminReviewLayoutDumb(props: AdminReviewLayoutDumbProps) {
  return (
    <div className="space-y-4">
      {props.sessionLostMessage ? (
        <p
          role="alert"
          className="rounded-md border border-rose-900 bg-rose-950 px-3 py-2 text-sm text-rose-200"
        >
          {props.sessionLostMessage}
        </p>
      ) : null}
      {props.conflictMessage ? (
        <p
          role="alert"
          className="rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-sm text-amber-200"
        >
          {props.conflictMessage}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {props.list}
        {props.detail}
      </div>
    </div>
  )
}
