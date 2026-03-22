import type { ReactNode } from 'react'

export type AppShellDumbProps = {
  children: ReactNode
  header: ReactNode
}

export function AppShellDumb(props: AppShellDumbProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {props.header}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
          {props.children}
        </main>
      </div>
    </div>
  )
}
