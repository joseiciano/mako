import type { ReactNode } from 'react'

export type AppShellDumbProps = {
  children: ReactNode
  header: ReactNode
  sidebar?: ReactNode
  mobileNavigation?: ReactNode
}

export function AppShellDumb(props: AppShellDumbProps) {
  const shouldOffsetForSidebar = Boolean(props.sidebar)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {props.sidebar}

      <div
        className={
          shouldOffsetForSidebar ? 'min-h-screen lg:pl-72' : 'min-h-screen'
        }
      >
        {props.header}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
            {props.children}
          </main>
        </div>
      </div>

      {props.mobileNavigation}
    </div>
  )
}
